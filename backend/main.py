import asyncio
import hashlib
import json
import multiprocessing
import os
import re
import signal
import subprocess
import sys
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import db
from filename_parser import parse_filename
from nights import group_videos_into_nights, compute_night_summary
from pipeline import process_video
from plms import apply_plms_criteria
from arousal import compute_video_arousal

# Parallel workers for batch processing
MAX_WORKERS = max(2, (os.cpu_count() or 4) // 2)

VIDEOS_DIR = Path(os.environ.get("VIDEOS_DIR", str(Path(__file__).resolve().parent.parent / "videos")))
HR_INPUT_DIR = Path(os.environ.get("HR_INPUT_DIR", str(Path(__file__).resolve().parent.parent / "hr_input")))
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
HR_INPUT_DIR.mkdir(parents=True, exist_ok=True)

HR_STATUS_FILE = HR_INPUT_DIR / "hr_status.json"

# Processing state (in-memory, not persisted)
_processing = {"running": False, "progress": {}, "error": None}

# HR ingestion background task
_hr_ingest_task: asyncio.Task | None = None


def _video_id(filename: str) -> str:
    return hashlib.md5(filename.encode()).hexdigest()[:10]


def _scan_videos() -> list[dict]:
    """Scan video files on disk and return parsed metadata."""
    videos = []
    for f in sorted(VIDEOS_DIR.glob("*.mp4")):
        try:
            parsed = parse_filename(f.name)
        except ValueError:
            continue
        videos.append({
            "id": _video_id(f.name),
            "filename": f.name,
            "start": parsed["start"].isoformat(),
            "end": parsed["end"].isoformat(),
            "start_local": parsed["start_local"].isoformat(),
            "end_local": parsed["end_local"].isoformat(),
            "duration_sec": parsed["duration_sec"],
        })
    return videos


async def _sync_videos_to_db():
    """Ensure all video files on disk have entries in the database."""
    for v in _scan_videos():
        await db.upsert_video(v)


async def _hr_ingest_loop():
    """Background task: periodically import HR readings from JSONL into DB."""
    while True:
        try:
            count = await db.ingest_hr_readings(HR_INPUT_DIR)
            if count > 0:
                pass  # imported readings
        except Exception:
            pass
        await asyncio.sleep(30)


# --- App lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _hr_ingest_task
    await db.init_db()
    await _sync_videos_to_db()
    _hr_ingest_task = asyncio.create_task(_hr_ingest_loop())
    yield
    if _hr_ingest_task:
        _hr_ingest_task.cancel()
    await db.close_db()


app = FastAPI(title="PLMS Detector", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Video serving with Range support ---

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


# --- Processing ---

def _process_one_video(args):
    """Worker function for parallel processing."""
    video_path_str, vid, progress_dict = args
    from pipeline import process_video
    from pathlib import Path

    def progress_cb(pct):
        progress_dict[vid] = pct

    result = process_video(Path(video_path_str), progress_cb)
    return vid, result


def _save_results_sync(video_meta, result):
    """Save processing results to DB (called from sync thread via asyncio.run)."""
    recording_hours = video_meta["duration_sec"] / 3600.0
    plms_result = apply_plms_criteria(result["events"], recording_hours)

    import asyncio
    asyncio.run(db.save_video_results(
        video_meta, result["video_info"], result["motion_signal"],
        plms_result["events"], plms_result["series"], plms_result["summary"],
    ))


def _run_processing():
    try:
        videos = _scan_videos()
        # Check which are already processed
        import asyncio
        processed_set = set()
        for v in videos:
            if asyncio.run(db.is_video_processed(v["id"])):
                processed_set.add(v["id"])

        to_process = [v for v in videos if v["id"] not in processed_set]

        manager = multiprocessing.Manager()
        shared_progress = manager.dict({v["id"]: 0.0 for v in to_process})
        for v in videos:
            if v["id"] in processed_set:
                shared_progress[v["id"]] = 1.0
        _processing["progress"] = shared_progress

        if not to_process:
            return

        worker_args = [
            (str(VIDEOS_DIR / v["filename"]), v["id"], shared_progress)
            for v in to_process
        ]

        n_workers = min(MAX_WORKERS, len(to_process))
        with ProcessPoolExecutor(max_workers=n_workers) as pool:
            futures = {pool.submit(_process_one_video, args): args[1] for args in worker_args}

            for future in as_completed(futures):
                vid = futures[future]
                try:
                    _, result = future.result()
                except Exception as e:
                    _processing["error"] = f"Video {vid}: {e}"
                    shared_progress[vid] = -1
                    continue

                v = next(v for v in videos if v["id"] == vid)
                _save_results_sync(v, result)
                shared_progress[vid] = 1.0

    except Exception as e:
        _processing["error"] = str(e)
        raise
    finally:
        _processing["running"] = False


def _run_single_processing(video_id: str):
    try:
        videos = _scan_videos()
        v = next((v for v in videos if v["id"] == video_id), None)
        if not v:
            _processing["error"] = f"Video {video_id} not found"
            return

        _processing["progress"] = {video_id: 0.0}

        def progress_cb(pct):
            _processing["progress"][video_id] = pct

        result = process_video(VIDEOS_DIR / v["filename"], progress_cb)
        _save_results_sync(v, result)
        _processing["progress"][video_id] = 1.0

    except Exception as e:
        _processing["error"] = str(e)
        raise
    finally:
        _processing["running"] = False


@app.post("/api/process")
async def start_processing():
    if _processing["running"]:
        return {"status": "already_running"}
    await _sync_videos_to_db()
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {}
    threading.Thread(target=_run_processing, daemon=True).start()
    return {"status": "started"}


@app.post("/api/process/{video_id}")
async def start_single_processing(video_id: str):
    if _processing["running"]:
        return {"status": "already_running"}
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {}
    threading.Thread(target=_run_single_processing, args=(video_id,), daemon=True).start()
    return {"status": "started"}


@app.post("/api/reanalyze/{video_id}")
async def reanalyze_video(video_id: str):
    if _processing["running"]:
        return {"status": "already_running"}
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {video_id: 0.0}

    def run():
        try:
            import asyncio
            asyncio.run(db.delete_video_results(video_id))
            _run_single_processing(video_id)
        except Exception as e:
            _processing["error"] = str(e)
        finally:
            _processing["running"] = False

    threading.Thread(target=run, daemon=True).start()
    return {"status": "started"}


@app.post("/api/reprocess-night/{night_date}")
async def reprocess_night(night_date: str):
    if _processing["running"]:
        return {"status": "already_running"}

    videos = await db.list_videos()
    nights = group_videos_into_nights(videos)
    night = next((n for n in nights if n["night_date"] == night_date), None)
    if not night:
        return {"status": "error", "error": f"Night {night_date} not found"}

    video_ids = night["video_ids"]
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {vid: 0.0 for vid in video_ids}

    def run():
        try:
            import asyncio
            for vid in video_ids:
                asyncio.run(db.delete_video_results(vid))

            all_videos = _scan_videos()
            for vid in video_ids:
                v = next((v for v in all_videos if v["id"] == vid), None)
                if not v:
                    continue

                def progress_cb(pct, _vid=vid):
                    _processing["progress"][_vid] = pct

                result = process_video(VIDEOS_DIR / v["filename"], progress_cb)
                _save_results_sync(v, result)
                _processing["progress"][vid] = 1.0
        except Exception as e:
            _processing["error"] = str(e)
        finally:
            _processing["running"] = False

    threading.Thread(target=run, daemon=True).start()
    return {"status": "started", "video_count": len(video_ids)}


@app.get("/api/process/status")
async def processing_status():
    progress = _processing["progress"]
    return {
        "running": _processing["running"],
        "progress": dict(progress) if progress else {},
        "error": _processing["error"],
    }


# --- Results ---

@app.get("/api/results")
async def list_results():
    return await db.list_videos()


@app.get("/api/results/combined")
async def combined_results():
    pool = await db.get_pool()
    row = await pool.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE processed) as video_count,
            COALESCE(SUM(duration_sec) FILTER (WHERE processed), 0) / 3600.0 as total_hours,
            (SELECT COUNT(*) FROM events) as total_movements,
            (SELECT COUNT(*) FROM events WHERE is_plm) as plm_count,
            (SELECT COUNT(DISTINCT (video_id, series_id)) FROM events WHERE series_id IS NOT NULL) as series_count
        FROM videos
    """)
    total_hours = float(row["total_hours"])
    plm_count = row["plm_count"]
    return {
        "total_hours": round(total_hours, 2),
        "total_movements": row["total_movements"],
        "plm_count": plm_count,
        "plmi": round(plm_count / total_hours, 1) if total_hours > 0 else 0,
        "series_count": row["series_count"],
    }


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


# --- Nights ---

@app.get("/api/nights")
async def list_nights():
    videos = await db.list_videos()
    nights = group_videos_into_nights(videos)
    result = []
    for night in nights:
        videos_total = len(night["video_ids"])
        videos_processed = sum(
            1 for v in videos
            if v["id"] in night["video_ids"] and v.get("processed")
        )
        base = {
            "night_date": night["night_date"],
            "start_local": night["start_local"],
            "end_local": night["end_local"],
            "total_hours": night["total_hours"],
            "video_ids": night["video_ids"],
            "videos_total": videos_total,
            "videos_processed": videos_processed,
        }
        if videos_processed > 0:
            videos_info = await db.get_videos_for_ids(night["video_ids"])
            events = await db.get_events_for_videos(night["video_ids"])

            # Get HR readings for this night
            night_start = datetime.fromisoformat(night["start_local"]).timestamp()
            night_end = datetime.fromisoformat(night["end_local"]).timestamp()
            hr_readings = await db.get_hr_range(night_start - 60, night_end + 60)

            summary = compute_night_summary(night, videos_info, events, hr_readings or None)
            base["summary"] = summary["summary"]
            base["hourly_distribution"] = summary["hourly_distribution"]
            base["arousal_summary"] = summary.get("arousal_summary")
        else:
            base["summary"] = None
            base["hourly_distribution"] = None
            base["arousal_summary"] = None
        result.append(base)
    return result


@app.get("/api/nights/{night_date}")
async def night_detail(night_date: str):
    videos = await db.list_videos()
    nights = group_videos_into_nights(videos)
    night = next((n for n in nights if n["night_date"] == night_date), None)
    if not night:
        raise HTTPException(404, f"Night {night_date} not found")

    videos_info = await db.get_videos_for_ids(night["video_ids"])
    events = await db.get_events_for_videos(night["video_ids"])

    night_start = datetime.fromisoformat(night["start_local"]).timestamp()
    night_end = datetime.fromisoformat(night["end_local"]).timestamp()
    hr_readings = await db.get_hr_range(night_start - 60, night_end + 60)

    return compute_night_summary(night, videos_info, events, hr_readings or None)


# --- Heart Rate ---

@app.get("/api/hr/status")
async def hr_status():
    if HR_STATUS_FILE.exists():
        return json.loads(HR_STATUS_FILE.read_text())
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


@app.get("/api/hr/night/{night_date}")
async def hr_for_night(night_date: str):
    videos = await db.list_videos()
    nights = group_videos_into_nights(videos)
    night = next((n for n in nights if n["night_date"] == night_date), None)
    if not night:
        raise HTTPException(404, f"Night {night_date} not found")

    start = datetime.fromisoformat(night["start_local"]).timestamp()
    end = datetime.fromisoformat(night["end_local"]).timestamp()
    readings = await db.get_hr_range(start, end)
    return {"readings": readings, "night_date": night_date, "count": len(readings)}


@app.post("/api/hr/ingest")
async def hr_ingest():
    """Manually trigger HR data ingestion from JSONL files."""
    count = await db.ingest_hr_readings(HR_INPUT_DIR)
    return {"ingested": count}


# --- Video Upload ---

@app.post("/api/upload")
async def upload_videos(files: list[UploadFile]):
    saved = []
    for file in files:
        if not file.filename or not file.filename.lower().endswith(".mp4"):
            continue
        dest = VIDEOS_DIR / file.filename
        if dest.exists():
            saved.append({"filename": file.filename, "status": "exists"})
            continue
        content = await file.read()
        with open(dest, "wb") as f:
            f.write(content)
        saved.append({"filename": file.filename, "status": "uploaded", "size": len(content)})

    # Sync new videos to DB
    await _sync_videos_to_db()
    return {"uploaded": saved, "count": len(saved)}


# --- HR Listener Management ---

_hr_process: subprocess.Popen | None = None


@app.post("/api/hr/start")
async def hr_start():
    global _hr_process
    if _hr_process and _hr_process.poll() is None:
        return {"status": "already_running", "pid": _hr_process.pid}

    hr_script = Path(__file__).parent / "whoop_hr.py"
    if not hr_script.exists():
        raise HTTPException(404, "whoop_hr.py not found")

    _hr_process = subprocess.Popen(
        [sys.executable, str(hr_script)],
        cwd=str(Path(__file__).resolve().parent.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    import time
    time.sleep(2)
    if _hr_process.poll() is not None:
        stderr = _hr_process.stderr.read().decode() if _hr_process.stderr else ""
        _hr_process = None
        lines = [l for l in stderr.strip().splitlines() if l.strip()]
        if "FileNotFoundError" in stderr or "dbus" in stderr.lower():
            msg = "Bluetooth not available. WHOOP monitoring requires running outside Docker on a host with Bluetooth."
        elif lines:
            msg = lines[-1]
        else:
            msg = "HR monitor process exited immediately."
        return {"status": "failed", "error": msg}

    return {"status": "started", "pid": _hr_process.pid}


@app.post("/api/hr/stop")
async def hr_stop():
    global _hr_process
    if not _hr_process or _hr_process.poll() is not None:
        _hr_process = None
        return {"status": "not_running"}

    _hr_process.send_signal(signal.SIGTERM)
    try:
        _hr_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _hr_process.kill()
    pid = _hr_process.pid
    _hr_process = None

    if HR_STATUS_FILE.exists():
        HR_STATUS_FILE.unlink()

    return {"status": "stopped", "pid": pid}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
