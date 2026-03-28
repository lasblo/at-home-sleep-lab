import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import db
import session_manager
import unifi
from nights import group_videos_into_nights, compute_night_summary
from arousal import compute_video_arousal

VIDEOS_DIR = Path(os.environ.get("VIDEOS_DIR", str(Path(__file__).resolve().parent.parent / "videos")))
HR_INPUT_DIR = Path(os.environ.get("HR_INPUT_DIR", str(Path(__file__).resolve().parent.parent / "hr_input")))
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
HR_INPUT_DIR.mkdir(parents=True, exist_ok=True)

HR_STATUS_FILE = HR_INPUT_DIR / "hr_status.json"

# HR ingestion background task
_hr_ingest_task: asyncio.Task | None = None


async def _hr_ingest_loop():
    """Background task: periodically import HR readings from JSONL into DB."""
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
        session = await session_manager.start_session()
        return session
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/sessions/stop")
async def stop_session():
    try:
        session = await session_manager.stop_session()
        return session
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/sessions/active")
async def active_session():
    session = await db.get_active_session()
    return {"session": session}


@app.get("/api/sessions")
async def list_sessions():
    return await db.list_sessions()


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
    # Don't expose password in GET
    if key == "unifi" and "password" in value:
        value = {**value, "password": "••••••••" if value["password"] else ""}
    return value


@app.put("/api/settings/{key}")
async def set_setting(key: str, request: Request):
    body = await request.json()
    # For unifi settings, preserve existing password if masked
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
    return await unifi.test_connection(
        body["host"], body["username"], body["password"]
    )


@app.post("/api/unifi/cameras")
async def unifi_cameras(request: Request):
    body = await request.json()
    cameras = await unifi.list_cameras(
        body["host"], body["username"], body["password"]
    )
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
        end = int(m.group(2)) if m.group(2) else min(start + 2 * 1024 * 1024, file_size - 1)
        end = min(end, file_size - 1)
        with open(path, "rb") as f:
            f.seek(start)
            data = f.read(end - start + 1)
        return Response(
            content=data, status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(data)),
                "Content-Type": "video/mp4",
            },
        )

    with open(path, "rb") as f:
        data = f.read(2 * 1024 * 1024)
    return Response(
        content=data, status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": "video/mp4",
        },
    )


# ── Results (video analysis) ───────────────────────────────────────

@app.get("/api/results")
async def list_results():
    return await db.list_videos()


@app.get("/api/results/{video_id}")
async def video_results(video_id: str):
    data = await db.get_video_results(video_id)
    if not data:
        raise HTTPException(404, "Results not found for this video")

    # On-demand arousal annotation from DB HR readings
    video = data.get("video", {})
    start_local = video.get("start_local", "")
    duration = video.get("duration_sec", 3600)
    if start_local and data.get("events"):
        start_epoch = datetime.fromisoformat(start_local).timestamp()
        hr_readings = await db.get_hr_range(start_epoch - 60, start_epoch + duration + 60)
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


# ── BLE Proxy (forwards to host BLE service) ───────────────────────

async def _ble_url() -> str:
    settings = await db.get_setting("whoop")
    return (settings or {}).get("ble_service_url", "http://host.docker.internal:8001")


@app.get("/api/ble/discover")
async def ble_discover():
    """Discover WHOOP devices via host BLE service."""
    import httpx
    url = await _ble_url()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{url}/discover")
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": f"BLE service unreachable: {e}", "devices": []}


@app.post("/api/ble/test")
async def ble_test(request: Request):
    """Test HR reading from a specific device via host BLE service."""
    import httpx
    url = await _ble_url()
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{url}/test", json=body)
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": f"BLE service unreachable: {e}"}


@app.post("/api/ble/start")
async def ble_start(request: Request):
    """Start HR streaming via host BLE service."""
    import httpx
    url = await _ble_url()
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{url}/start", json=body)
            return resp.json()
    except Exception as e:
        return {"status": "error", "error": f"BLE service unreachable: {e}"}


@app.post("/api/ble/stop")
async def ble_stop():
    """Stop HR streaming via host BLE service."""
    import httpx
    url = await _ble_url()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{url}/stop")
            return resp.json()
    except Exception as e:
        return {"status": "error", "error": f"BLE service unreachable: {e}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
