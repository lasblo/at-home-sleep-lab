import json
import os
import re
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from filename_parser import parse_filename
from pipeline import process_video
from plms import apply_plms_criteria

app = FastAPI(title="PLMS Detector")
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

def _run_processing():
    try:
        videos = _list_videos()
        _processing["progress"] = {v["id"]: 0.0 for v in videos}

        all_events = []
        total_hours = 0.0

        for v in videos:
            vid = v["id"]
            video_path = VIDEOS_DIR / v["filename"]

            def progress_cb(pct, _vid=vid):
                _processing["progress"][_vid] = pct

            result = process_video(video_path, progress_cb)
            recording_hours = v["duration_sec"] / 3600.0
            total_hours += recording_hours

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

            all_events.extend([
                {**e, "video_id": vid, "absolute_sec": e["timestamp_sec"] + (total_hours - recording_hours) * 3600}
                for e in plms_result["events"]
            ])

            _processing["progress"][vid] = 1.0

        # Combined summary
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

    except Exception as e:
        _processing["error"] = str(e)
        raise
    finally:
        _processing["running"] = False


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
    return {
        "running": _processing["running"],
        "progress": _processing["progress"],
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
