import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

import db
import session_manager
import unifi
from arousal import compute_video_arousal

VIDEOS_DIR = Path(
    os.environ.get("VIDEOS_DIR", str(Path(__file__).resolve().parent.parent / "videos"))
)
HR_INPUT_DIR = Path(
    os.environ.get(
        "HR_INPUT_DIR", str(Path(__file__).resolve().parent.parent / "hr_input")
    )
)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
HR_INPUT_DIR.mkdir(parents=True, exist_ok=True)

HR_STATUS_FILE = HR_INPUT_DIR / "hr_status.json"

_hr_ingest_task: asyncio.Task | None = None


async def _hr_ingest_loop():
    while True:
        try:
            await db.ingest_hr_readings(HR_INPUT_DIR)
        except Exception:
            pass
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _hr_ingest_task
    await db.init_db()
    session_manager.VIDEOS_DIR = VIDEOS_DIR
    _hr_ingest_task = asyncio.create_task(_hr_ingest_loop())
    yield
    if _hr_ingest_task:
        _hr_ingest_task.cancel()
    await session_manager.cleanup()
    await db.close_db()


app = FastAPI(title="Sleep Lab", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Sessions ────────────────────────────────────────────────────────


@app.post("/api/sessions/start")
async def start_session():
    try:
        return await session_manager.start_session()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/sessions/stop")
async def stop_session():
    try:
        return await session_manager.stop_session()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.get("/api/sessions/active")
async def active_session():
    session = await db.get_active_session()
    return {"session": session}


@app.get("/api/sessions")
async def list_sessions():
    return await db.list_sessions()


@app.get("/api/dashboard/summary")
async def dashboard_summary():
    return await db.get_dashboard_summary()


@app.get("/api/sessions/{session_id}")
async def session_detail(session_id: str):
    detail = await db.get_session_detail(session_id)
    if not detail:
        raise HTTPException(404, "Session not found")
    return detail


# ── Settings ────────────────────────────────────────────────────────


@app.get("/api/settings/{key}")
async def get_setting(key: str):
    value = await db.get_setting(key)
    if value is None:
        return {}
    if key == "unifi" and "password" in value:
        value = {**value, "password": "••••••••" if value["password"] else ""}
    return value


@app.put("/api/settings/{key}")
async def set_setting(key: str, request: Request):
    body = await request.json()
    if key == "unifi" and body.get("password", "").startswith("••"):
        existing = await db.get_setting("unifi")
        if existing:
            body["password"] = existing.get("password", "")
    await db.set_setting(key, body)
    return {"ok": True}


# ── UniFi Protect ───────────────────────────────────────────────────


@app.post("/api/unifi/test")
async def unifi_test(request: Request):
    body = await request.json()
    return await unifi.test_connection(body["host"], body["username"], body["password"])


@app.post("/api/unifi/cameras")
async def unifi_cameras(request: Request):
    body = await request.json()
    cameras = await unifi.list_cameras(body["host"], body["username"], body["password"])
    return {"cameras": cameras}


# ── Video Serving ───────────────────────────────────────────────────


@app.get("/api/videos/{filename:path}")
async def serve_video(filename: str, request: Request):
    path = VIDEOS_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Video not found")

    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not m:
            raise HTTPException(416, "Invalid range")
        start = int(m.group(1))
        end = (
            int(m.group(2))
            if m.group(2)
            else min(start + 2 * 1024 * 1024, file_size - 1)
        )
        end = min(end, file_size - 1)
        with open(path, "rb") as f:
            f.seek(start)
            data = f.read(end - start + 1)
        return Response(
            content=data,
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(data)),
                "Content-Type": "video/mp4",
            },
        )

    return FileResponse(path, media_type="video/mp4")


# ── Video Scanning ─────────────────────────────────────────────────


def _parse_unifi_filename(filename: str) -> dict | None:
    """Parse UniFi-style filename into timestamps.

    Format: 'Full Body M-D-YYYY, HH.MM.SS GMT+1 - M-D-YYYY, HH.MM.SS GMT+1.mp4'
    """
    import hashlib
    from datetime import timezone, timedelta
    from zoneinfo import ZoneInfo

    pattern = (
        r"Full Body "
        r"(\d{1,2})-(\d{1,2})-(\d{4}), (\d{2})\.(\d{2})\.(\d{2}) GMT\+(\d+)"
        r" - "
        r"(\d{1,2})-(\d{1,2})-(\d{4}), (\d{2})\.(\d{2})\.(\d{2}) GMT\+(\d+)"
    )
    m = re.match(pattern, filename.replace(".mp4", ""))
    if not m:
        return None
    g = [int(x) for x in m.groups()]
    tz_start = timezone(timedelta(hours=g[6]))
    tz_end = timezone(timedelta(hours=g[13]))
    start = datetime(g[2], g[0], g[1], g[3], g[4], g[5], tzinfo=tz_start)
    end = datetime(g[9], g[7], g[8], g[10], g[11], g[12], tzinfo=tz_end)
    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    local_tz = ZoneInfo("Europe/Copenhagen")
    start_local = start.astimezone(local_tz)
    end_local = end.astimezone(local_tz)
    duration_sec = (end_utc - start_utc).total_seconds()
    video_id = hashlib.sha256(filename.encode()).hexdigest()[:12]
    return {
        "id": video_id,
        "filename": filename,
        "start_utc": start_utc,
        "end_utc": end_utc,
        "start_local": start_local,
        "end_local": end_local,
        "duration_sec": duration_sec,
    }


@app.post("/api/videos/scan")
async def scan_videos():
    """Scan VIDEOS_DIR for .mp4 files and register them in the database."""
    mp4_files = sorted(VIDEOS_DIR.glob("*.mp4"))
    existing = {v["filename"] for v in await db.list_videos()}
    added = []
    for path in mp4_files:
        if path.name in existing:
            continue
        parsed = _parse_unifi_filename(path.name)
        if not parsed:
            continue
        await db.insert_video(
            video_id=parsed["id"],
            filename=parsed["filename"],
            start_utc=parsed["start_utc"],
            end_utc=parsed["end_utc"],
            start_local=parsed["start_local"],
            end_local=parsed["end_local"],
            duration_sec=parsed["duration_sec"],
        )
        added.append(parsed["filename"])
    return {"scanned": len(mp4_files), "added": len(added), "files": added}


# ── Results (video analysis) ───────────────────────────────────────


@app.get("/api/results")
async def list_results():
    return await db.list_videos()


@app.get("/api/results/{video_id}")
async def video_results(video_id: str):
    data = await db.get_video_results(video_id)
    if not data:
        raise HTTPException(404, "Results not found for this video")

    video = data.get("video", {})
    start_local = video.get("start_local", "")
    duration = video.get("duration_sec", 3600)
    if start_local and data.get("events"):
        start_epoch = datetime.fromisoformat(start_local).timestamp()
        hr_readings = await db.get_hr_range(
            start_epoch - 60, start_epoch + duration + 60
        )
        if hr_readings:
            data["events"], data["arousal_summary"] = compute_video_arousal(
                data["events"], start_local, hr_readings, duration
            )

    return data


# ── Heart Rate ──────────────────────────────────────────────────────


@app.get("/api/hr/status")
async def hr_status():
    if HR_STATUS_FILE.exists():
        try:
            return json.loads(HR_STATUS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"status": "stopped"}


@app.get("/api/hr/live")
async def hr_live(since: float = 0, limit: int = 500):
    readings = await db.get_hr_latest(since, limit)
    return {"readings": readings, "count": len(readings)}


@app.get("/api/hr/range")
async def hr_range(start: str, end: str):
    start_epoch = datetime.fromisoformat(start).timestamp()
    end_epoch = datetime.fromisoformat(end).timestamp()
    readings = await db.get_hr_range(start_epoch, end_epoch)
    return {"readings": readings, "count": len(readings)}


@app.post("/api/hr/ingest")
async def hr_ingest():
    count = await db.ingest_hr_readings(HR_INPUT_DIR)
    return {"ingested": count}


# ── Labels (ground truth) ──────────────────────────────────────────


@app.get("/api/labels/stats")
async def label_stats():
    return await db.get_label_stats()


@app.get("/api/labels/export")
async def export_labels(video_id: str | None = None):
    return await db.export_labels(video_id)


@app.get("/api/labels/{video_id}")
async def get_labels(video_id: str):
    return await db.get_labels(video_id)


@app.post("/api/labels/{video_id}")
async def create_label(video_id: str, request: Request):
    body = await request.json()
    return await db.create_label(
        video_id=video_id,
        timestamp_sec=body["timestamp_sec"],
        category=body["category"],
        duration_sec=body.get("duration_sec", 0.5),
        notes=body.get("notes"),
    )


@app.put("/api/labels/item/{label_id}")
async def update_label(label_id: int, request: Request):
    body = await request.json()
    allowed = {"timestamp_sec", "duration_sec", "category", "notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    result = await db.update_label(label_id, **updates)
    if not result:
        raise HTTPException(404, "Label not found")
    return result


@app.delete("/api/labels/item/{label_id}")
async def delete_label(label_id: int):
    deleted = await db.delete_label(label_id)
    if not deleted:
        raise HTTPException(404, "Label not found")
    return {"ok": True}


# ── BLE Proxy (forwards to host BLE service) ───────────────────────


async def _ble_url() -> str:
    ble_settings = await db.get_setting("bluetooth")
    return (ble_settings or {}).get("url", "http://host.docker.internal:8001")


async def _ble_proxy(
    method: str,
    endpoint: str,
    json_body=None,
    timeout: float = 20,
    error_extra: dict | None = None,
):
    url = await _ble_url()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(method, f"{url}{endpoint}", json=json_body)
            return resp.json()
    except Exception as e:
        result = {"ok": False, "error": f"BLE service unreachable: {e}"}
        if error_extra:
            result.update(error_extra)
        return result


@app.get("/api/ble/discover")
async def ble_discover():
    return await _ble_proxy("GET", "/discover", error_extra={"devices": []})


@app.post("/api/ble/test")
async def ble_test(request: Request):
    return await _ble_proxy("POST", "/test", json_body=await request.json())


@app.post("/api/ble/start")
async def ble_start(request: Request):
    return await _ble_proxy("POST", "/start", json_body=await request.json())


@app.post("/api/ble/stop")
async def ble_stop():
    return await _ble_proxy("POST", "/stop", timeout=10)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
