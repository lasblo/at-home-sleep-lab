"""Sleep session lifecycle manager.

Handles starting/stopping recording sessions, scheduling hourly video
fetches from UniFi Protect, running the motion-detection pipeline on
each chunk, and coordinating with the BLE HR service running on the host.
"""

import asyncio
import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

import db
from pipeline import process_video
from plms import apply_plms_criteria

logger = logging.getLogger(__name__)

VIDEOS_DIR = Path(os.environ.get("VIDEOS_DIR", "/data/videos"))

# Active session background task
_fetch_task: asyncio.Task | None = None


def _video_id(filename: str) -> str:
    """Derive a short deterministic ID from a filename (first 10 hex chars of MD5)."""
    return hashlib.md5(filename.encode()).hexdigest()[:10]


def _safe_iso(dt: datetime) -> str:
    """Format a datetime as an ISO-like string safe for filenames (no colons)."""
    return dt.strftime("%Y%m%dT%H%M%S")


def _night_date(dt: datetime) -> str:
    """Determine the calendar night-date for a session start time.

    If the session starts at 18:00 or later, the night belongs to that date.
    Otherwise it belongs to the previous date (e.g. 02:00 on the 5th is the
    night of the 4th).
    """
    if dt.hour >= 18:
        return dt.strftime("%Y-%m-%d")
    return (dt - timedelta(days=1)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def start_session() -> dict:
    """Start a new sleep session.

    1. Check no active session exists
    2. Get UniFi + HR monitor settings from DB
    3. Create session record
    4. Start HR listener if enabled (call BLE service)
    5. Start background hourly video fetch task
    6. Return session dict
    """
    global _fetch_task

    active = await db.get_active_session()
    if active is not None:
        raise RuntimeError(
            f"A session is already active (id={active['id']}, "
            f"started {active['started_at']})"
        )

    unifi_settings = await db.get_setting("unifi")
    if not unifi_settings:
        raise RuntimeError(
            "UniFi settings not configured. Set the 'unifi' key in settings first."
        )

    camera_id = unifi_settings.get("camera_id")
    if not camera_id:
        raise RuntimeError("No camera_id found in UniFi settings.")

    whoop_settings = await db.get_setting("whoop") or {}
    hr_enabled = bool(whoop_settings.get("enabled"))
    ble_settings = await db.get_setting("bluetooth") or {}
    ble_url = ble_settings.get("url", "http://host.docker.internal:8001")

    now = datetime.now(timezone.utc)
    session_id = uuid.uuid4().hex[:12]
    night = _night_date(now)

    session = await db.create_session(
        session_id=session_id,
        night_date=night,
        started_at=now.isoformat(),
        hr_enabled=hr_enabled,
        camera_id=camera_id,
    )

    if hr_enabled:
        try:
            device_address = whoop_settings.get("device_address")
            await _start_hr(ble_url, device_address)
            logger.info("HR listener started via BLE service at %s", ble_url)
        except Exception:
            logger.exception(
                "Failed to start HR listener — session continues without HR"
            )

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    _fetch_task = asyncio.create_task(_fetch_loop(session_id, camera_id))
    logger.info(
        "Session %s started (night %s, camera %s)", session_id, night, camera_id
    )

    return session


async def stop_session() -> dict:
    """Stop the active session.

    1. Get active session
    2. Cancel fetch task
    3. Fetch final video chunk (partial hour since last fetch)
    4. Process final chunk
    5. Stop HR listener if enabled
    6. Ingest final HR readings
    7. Update session status to 'processing' then 'analyzed'
    8. Return session dict
    """
    global _fetch_task

    session = await db.get_active_session()
    if session is None:
        raise RuntimeError("No active session to stop.")

    session_id = session["id"]
    camera_id = session.get("unifi_camera_id")

    # --- Cancel the background fetch loop -----------------------------------
    if _fetch_task is not None:
        _fetch_task.cancel()
        try:
            await _fetch_task
        except asyncio.CancelledError:
            pass
        _fetch_task = None

    # --- Fetch + process the final partial chunk ----------------------------
    started_at = datetime.fromisoformat(session["started_at"])
    now = datetime.now(timezone.utc)

    # The last full-hour fetch covered up to the most recent hour boundary.
    # Fetch from that boundary (or session start) to now.
    last_hour_boundary = now.replace(minute=0, second=0, microsecond=0)
    chunk_start = max(started_at, last_hour_boundary)

    if camera_id and (now - chunk_start).total_seconds() > 60:
        try:
            await db.update_session(session_id, status="processing")
            await _fetch_and_process(session_id, chunk_start, now, camera_id)
        except Exception:
            logger.exception("Failed to fetch/process final video chunk")

    # --- Stop HR listener and ingest remaining readings ---------------------
    whoop_settings = await db.get_setting("whoop") or {}
    hr_enabled = bool(whoop_settings.get("enabled"))
    ble_settings = await db.get_setting("bluetooth") or {}
    ble_url = ble_settings.get("url", "http://host.docker.internal:8001")

    if hr_enabled:
        try:
            await _stop_hr(ble_url)
            logger.info("HR listener stopped")
        except Exception:
            logger.exception("Failed to stop HR listener")

    # Final HR ingestion
    hr_input_dir = Path(os.environ.get("HR_INPUT_DIR", "/data/hr_input"))
    try:
        count = await db.ingest_hr_readings(hr_input_dir)
        if count:
            logger.info("Ingested %d final HR readings", count)
    except Exception:
        logger.exception("Failed to ingest final HR readings")

    # --- Finalize session ---------------------------------------------------
    total_hours = (now - started_at).total_seconds() / 3600.0

    await db.update_session(
        session_id,
        status="analyzed",
        stopped_at=now.isoformat(),
        total_hours=round(total_hours, 4),
    )
    db.invalidate_dashboard_cache()

    result = await db.get_session(session_id)
    logger.info(
        "Session %s stopped (%.2f hours, night %s)",
        session_id,
        total_hours,
        session.get("night_date"),
    )
    return result


# ---------------------------------------------------------------------------
# Background fetch loop
# ---------------------------------------------------------------------------


async def _fetch_loop(session_id: str, camera_id: str):
    """Background task: fetch and process video every hour during active session.

    Runs continuously until cancelled.  On each iteration:
    1. Sleep until the next hour boundary
    2. Fetch previous hour's video from UniFi Protect
    3. Save to VIDEOS_DIR with generated filename
    4. Insert video record in DB with session_id
    5. Process video (run in thread to not block event loop)
    6. Save results to DB
    7. Ingest any new HR readings
    """
    hr_input_dir = Path(os.environ.get("HR_INPUT_DIR", "/data/hr_input"))

    try:
        while True:
            now = datetime.now(timezone.utc)
            # Next hour boundary
            next_hour = (now + timedelta(hours=1)).replace(
                minute=0, second=0, microsecond=0
            )
            sleep_seconds = (next_hour - now).total_seconds()
            logger.debug(
                "Fetch loop: sleeping %.0f s until %s",
                sleep_seconds,
                next_hour.isoformat(),
            )
            await asyncio.sleep(sleep_seconds)

            # The chunk covers the hour that just ended
            chunk_end = datetime.now(timezone.utc).replace(
                minute=0, second=0, microsecond=0
            )
            chunk_start = chunk_end - timedelta(hours=1)

            try:
                await _fetch_and_process(session_id, chunk_start, chunk_end, camera_id)
            except Exception:
                logger.exception(
                    "Error fetching/processing chunk %s – %s",
                    chunk_start.isoformat(),
                    chunk_end.isoformat(),
                )

            # Ingest HR readings that may have accumulated
            try:
                await db.ingest_hr_readings(hr_input_dir)
            except Exception:
                logger.exception("Error ingesting HR readings")

    except asyncio.CancelledError:
        logger.info("Fetch loop for session %s cancelled", session_id)
        raise


# ---------------------------------------------------------------------------
# Single chunk fetch + process
# ---------------------------------------------------------------------------


async def _fetch_and_process(
    session_id: str,
    start: datetime,
    end: datetime,
    camera_id: str,
):
    """Fetch a single video chunk from UniFi Protect and process it.

    Steps:
    1. Download video bytes via the ``unifi`` module
    2. Write to disk with a deterministic filename
    3. Insert a video record in the DB
    4. Run the motion-detection pipeline (in a thread)
    5. Apply PLMS criteria and save results
    """
    import unifi  # imported here so the module is only required at runtime

    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)

    unifi_settings = await db.get_setting("unifi")
    client = unifi.ProtectClient(
        host=unifi_settings["host"],
        username=unifi_settings["username"],
        password=unifi_settings["password"],
    )

    logger.info(
        "Fetching video: camera=%s, %s – %s",
        camera_id,
        start.isoformat(),
        end.isoformat(),
    )
    video_bytes = await client.get_video(camera_id, start_ms, end_ms)

    # Build filename and write to disk
    filename = f"sleep_{_safe_iso(start)}_{_safe_iso(end)}.mp4"
    video_path = VIDEOS_DIR / filename
    video_path.write_bytes(video_bytes)

    vid = _video_id(filename)
    duration_sec = (end - start).total_seconds()

    await db.insert_video(
        video_id=vid,
        filename=filename,
        start_utc=start.isoformat(),
        end_utc=end.isoformat(),
        start_local=start.isoformat(),
        end_local=end.isoformat(),
        duration_sec=duration_sec,
        session_id=session_id,
    )

    # Run CPU-bound pipeline in a thread so we don't block the event loop
    logger.info("Processing %s (%s)", filename, vid)
    result = await asyncio.to_thread(process_video, video_path)

    recording_hours = duration_sec / 3600.0
    plms_result = apply_plms_criteria(result["events"], recording_hours)

    video_meta = {"id": vid, "filename": filename, "duration_sec": duration_sec}
    await db.save_video_results(
        video_meta,
        result["video_info"],
        result["motion_signal"],
        plms_result["events"],
        plms_result["series"],
        plms_result["summary"],
    )
    logger.info(
        "Saved results for %s (PLMs: %d)", filename, plms_result["summary"]["plm_count"]
    )


# ---------------------------------------------------------------------------
# BLE HR service helpers
# ---------------------------------------------------------------------------


async def _start_hr(ble_url: str, device_address: str | None = None):
    """Call BLE service to start HR monitoring for a specific device."""
    body = {}
    if device_address:
        body["address"] = device_address
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{ble_url}/start", json=body)
        resp.raise_for_status()
        data = resp.json()
        logger.info("BLE HR start response: %s", data)
        return data


async def _stop_hr(ble_url: str):
    """Call BLE service to stop HR monitoring."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"{ble_url}/stop")
        resp.raise_for_status()
        data = resp.json()
        logger.info("BLE HR stop response: %s", data)
        return data
