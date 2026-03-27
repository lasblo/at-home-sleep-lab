import json
import multiprocessing
import os
import re
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from filename_parser import parse_filename
from nights import group_videos_into_nights, compute_night_summary
from pipeline import process_video
from plms import apply_plms_criteria

# Swift/Metal binary path (hardware-accelerated pipeline)
SWIFT_BINARY = Path(__file__).parent.parent / "swift-motion" / ".build" / "release" / "plms-motion"

# Parallel workers for batch processing (Python/OpenCV software decode)
MAX_WORKERS = max(2, (os.cpu_count() or 4) // 2)

app = FastAPI(title="PLMS Detector")

# Log processing backend
if SWIFT_BINARY.exists():
    print(f"[PLMS] Using Swift/Metal backend: {SWIFT_BINARY}")
else:
    print("[PLMS] Swift binary not found, using Python/OpenCV fallback")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
VIDEOS_DIR = BASE_DIR / "videos"
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Processing state
_processing = {"running": False, "progress": {}, "error": None}


def _video_id(filename: str) -> str:
    """Stable ID from filename using hashlib (deterministic across runs)."""
    import hashlib
    return hashlib.md5(filename.encode()).hexdigest()[:10]


def _list_videos() -> list[dict]:
    """List all MP4 files with parsed metadata."""
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
            content=data,
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(data)),
                "Content-Type": "video/mp4",
            },
        )

    # No range — return first 2MB chunk with accept-ranges header
    with open(path, "rb") as f:
        data = f.read(2 * 1024 * 1024)
    return Response(
        content=data,
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": "video/mp4",
        },
    )


# --- Processing ---

def _process_one_video(args):
    """Worker function for parallel processing. Must be top-level for pickling.

    Uses Python/OpenCV for batch processing — software decode across all CPU cores
    scales better than hardware decoder with multiple concurrent streams.
    Swift/Metal is used for single-video processing (lower latency).
    """
    video_path_str, vid, output_dir_str, progress_dict = args
    return _process_one_video_python(video_path_str, vid, progress_dict)


def _process_one_video_swift(video_path_str, vid, progress_dict):
    """Process video using Swift/Metal CLI — hardware-accelerated."""
    import subprocess, json, threading

    proc = subprocess.Popen(
        [str(SWIFT_BINARY), "process", video_path_str, "--progress"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    # Read stderr for progress updates in a background thread
    def read_progress():
        for line in proc.stderr:
            text = line.decode().strip()
            if text.startswith("PROGRESS:"):
                try:
                    pct = float(text.split(":")[1])
                    progress_dict[vid] = pct
                except (ValueError, IndexError):
                    pass

    progress_thread = threading.Thread(target=read_progress, daemon=True)
    progress_thread.start()

    # Read stdout separately (don't use communicate() which fights the stderr thread)
    stdout = proc.stdout.read()
    proc.wait()
    progress_thread.join(timeout=2)

    if proc.returncode != 0:
        raise RuntimeError(f"Swift CLI exited with code {proc.returncode}")

    result = json.loads(stdout)
    return vid, result


def _process_one_video_python(video_path_str, vid, progress_dict):
    """Process video using Python/OpenCV — CPU fallback."""
    from pipeline import process_video
    from pathlib import Path

    video_path = Path(video_path_str)

    def progress_cb(pct):
        progress_dict[vid] = pct

    result = process_video(video_path, progress_cb)
    return vid, result


def _run_processing():
    try:
        videos = _list_videos()
        # Skip already-processed videos
        to_process = [v for v in videos if not (OUTPUT_DIR / f"{v['id']}.json").exists()]

        manager = multiprocessing.Manager()
        shared_progress = manager.dict({v["id"]: 0.0 for v in to_process})
        # Mark already-done videos as 1.0
        for v in videos:
            if v not in to_process:
                shared_progress[v["id"]] = 1.0
        _processing["progress"] = shared_progress

        if not to_process:
            _write_combined(videos)
            return

        worker_args = [
            (str(VIDEOS_DIR / v["filename"]), v["id"], str(OUTPUT_DIR), shared_progress)
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

                if SWIFT_BINARY.exists():
                    # Swift CLI returns complete result with events/series/summary
                    output = {"video": v, **result}
                else:
                    # Python pipeline returns raw events; apply PLMS criteria
                    recording_hours = v["duration_sec"] / 3600.0
                    plms_result = apply_plms_criteria(result["events"], recording_hours)
                    output = {
                        "video": v,
                        "video_info": result["video_info"],
                        "motion_signal": result["motion_signal"],
                        **plms_result,
                    }

                out_path = OUTPUT_DIR / f"{vid}.json"
                with open(out_path, "w") as f:
                    json.dump(output, f)

                shared_progress[vid] = 1.0

        _write_combined(videos)

    except Exception as e:
        _processing["error"] = str(e)
        raise
    finally:
        _processing["running"] = False


def _write_combined(videos):
    """Write combined.json from all processed video outputs."""
    all_events = []
    total_hours = 0.0

    for v in sorted(videos, key=lambda v: v["start_local"]):
        vid = v["id"]
        out_path = OUTPUT_DIR / f"{vid}.json"
        if not out_path.exists():
            continue
        data = json.load(open(out_path))
        recording_hours = v["duration_sec"] / 3600.0
        all_events.extend([
            {**e, "video_id": vid, "absolute_sec": e["timestamp_sec"] + total_hours * 3600}
            for e in data["events"]
        ])
        total_hours += recording_hours

    total_plm = sum(1 for e in all_events if e.get("is_plm"))
    combined = {
        "videos": videos,
        "total_hours": round(total_hours, 2),
        "total_movements": len(all_events),
        "plm_count": total_plm,
        "plmi": round(total_plm / total_hours, 1) if total_hours > 0 else 0,
        "series_count": sum(
            len(json.load(open(OUTPUT_DIR / f"{v['id']}.json")).get("series", []))
            for v in videos
            if (OUTPUT_DIR / f"{v['id']}.json").exists()
        ),
    }
    with open(OUTPUT_DIR / "combined.json", "w") as f:
        json.dump(combined, f)


@app.post("/api/process")
async def start_processing():
    if _processing["running"]:
        return {"status": "already_running"}
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {}
    thread = threading.Thread(target=_run_processing, daemon=True)
    thread.start()
    return {"status": "started"}


def _run_single_processing(video_id: str):
    try:
        videos = _list_videos()
        v = next((v for v in videos if v["id"] == video_id), None)
        if not v:
            _processing["error"] = f"Video {video_id} not found"
            return

        vid = v["id"]
        _processing["progress"] = {vid: 0.0}
        video_path = VIDEOS_DIR / v["filename"]

        if SWIFT_BINARY.exists():
            _, result = _process_one_video_swift(str(video_path), vid, _processing["progress"])
            output = {"video": v, **result}
        else:
            def progress_cb(pct, _vid=vid):
                _processing["progress"][_vid] = pct

            result = process_video(video_path, progress_cb)
            recording_hours = v["duration_sec"] / 3600.0
            plms_result = apply_plms_criteria(result["events"], recording_hours)
            output = {
                "video": v,
                "video_info": result["video_info"],
                "motion_signal": result["motion_signal"],
                **plms_result,
            }

        out_path = OUTPUT_DIR / f"{vid}.json"
        with open(out_path, "w") as f:
            json.dump(output, f)

        _processing["progress"][vid] = 1.0

    except Exception as e:
        _processing["error"] = str(e)
        raise
    finally:
        _processing["running"] = False


@app.post("/api/process/{video_id}")
async def start_single_processing(video_id: str):
    if _processing["running"]:
        return {"status": "already_running"}
    _processing["running"] = True
    _processing["error"] = None
    _processing["progress"] = {}
    thread = threading.Thread(target=_run_single_processing, args=(video_id,), daemon=True)
    thread.start()
    return {"status": "started"}


@app.get("/api/process/status")
async def processing_status():
    # Convert Manager dict to plain dict for JSON serialization
    progress = _processing["progress"]
    return {
        "running": _processing["running"],
        "progress": dict(progress) if progress else {},
        "error": _processing["error"],
    }


# --- Results ---

@app.get("/api/results")
async def list_results():
    videos = _list_videos()
    results = []
    for v in videos:
        out_path = OUTPUT_DIR / f"{v['id']}.json"
        results.append({**v, "processed": out_path.exists()})
    return results


@app.get("/api/results/combined")
async def combined_results():
    path = OUTPUT_DIR / "combined.json"
    if not path.exists():
        raise HTTPException(404, "No results yet. Run processing first.")
    with open(path) as f:
        return json.load(f)


@app.get("/api/results/{video_id}")
async def video_results(video_id: str):
    path = OUTPUT_DIR / f"{video_id}.json"
    if not path.exists():
        raise HTTPException(404, "Results not found for this video")
    with open(path) as f:
        return json.load(f)


# --- Nights ---

@app.get("/api/nights")
async def list_nights():
    """List all nights with summary stats and hourly distribution."""
    videos = _list_videos()
    nights = group_videos_into_nights(videos)
    result = []
    for night in nights:
        videos_total = len(night["video_ids"])
        videos_processed = sum(
            1 for vid in night["video_ids"]
            if (OUTPUT_DIR / f"{vid}.json").exists()
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
            summary = compute_night_summary(night, OUTPUT_DIR)
            base["summary"] = summary["summary"]
            base["hourly_distribution"] = summary["hourly_distribution"]
        else:
            base["summary"] = None
            base["hourly_distribution"] = None
        result.append(base)
    return result


@app.get("/api/nights/{night_date}")
async def night_detail(night_date: str):
    """Full detail for one night: merged events, series, hourly distribution."""
    videos = _list_videos()
    nights = group_videos_into_nights(videos)
    night = next((n for n in nights if n["night_date"] == night_date), None)
    if not night:
        raise HTTPException(404, f"Night {night_date} not found")
    return compute_night_summary(night, OUTPUT_DIR)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
