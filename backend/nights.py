"""Group videos into nights and compute night-level analytics."""

import json
import math
from datetime import datetime, timedelta
from pathlib import Path

from plms import apply_plms_criteria
from arousal import compute_night_arousal

HR_DIR = Path(__file__).parent.parent / "output" / "hr"


MAX_GAP_HOURS = 2  # videos within this gap belong to the same night


def group_videos_into_nights(videos: list[dict]) -> list[dict]:
    """Group videos by night based on local timestamps.

    A night's label is the evening date: if recording starts at/after 18:00,
    use that date; otherwise use the previous date. So 00:15 on Mar 25 →
    "2026-03-24" night.

    Consecutive videos with gap < MAX_GAP_HOURS belong to the same night.
    """
    if not videos:
        return []

    # Parse and sort by start_local
    sorted_vids = sorted(videos, key=lambda v: v["start_local"])

    nights = []
    current_night = None

    for v in sorted_vids:
        start_local = datetime.fromisoformat(v["start_local"])
        end_local = datetime.fromisoformat(v["end_local"])

        if current_night is None:
            current_night = _new_night(v, start_local, end_local)
            continue

        # Check gap from previous video's end to this video's start
        prev_end = datetime.fromisoformat(current_night["end_local"])
        gap_hours = (start_local - prev_end).total_seconds() / 3600

        if gap_hours < MAX_GAP_HOURS:
            # Same night
            current_night["video_ids"].append(v["id"])
            current_night["end_local"] = v["end_local"]
            current_night["total_hours"] += v["duration_sec"] / 3600
        else:
            # New night
            current_night["total_hours"] = round(current_night["total_hours"], 2)
            nights.append(current_night)
            current_night = _new_night(v, start_local, end_local)

    if current_night:
        current_night["total_hours"] = round(current_night["total_hours"], 2)
        nights.append(current_night)

    return nights


def _new_night(video: dict, start_local: datetime, end_local: datetime) -> dict:
    """Create a new night dict from the first video."""
    # Night label: evening date
    if start_local.hour >= 18:
        night_date = start_local.strftime("%Y-%m-%d")
    else:
        night_date = (start_local - timedelta(days=1)).strftime("%Y-%m-%d")

    return {
        "night_date": night_date,
        "start_local": video["start_local"],
        "end_local": video["end_local"],
        "total_hours": video["duration_sec"] / 3600,
        "video_ids": [video["id"]],
    }


def compute_night_summary(night: dict, output_dir: Path) -> dict:
    """Compute full analytics for a single night.

    Merges events across all videos and re-scores PLMS for the whole night,
    which correctly detects series spanning video boundaries.
    """
    merged_events = []
    night_start = datetime.fromisoformat(night["start_local"])
    videos_info = []

    for vid in night["video_ids"]:
        vpath = output_dir / f"{vid}.json"
        if not vpath.exists():
            continue

        with open(vpath) as f:
            data = json.load(f)

        video_start = datetime.fromisoformat(data["video"]["start_local"])
        offset_sec = (video_start - night_start).total_seconds()

        videos_info.append({
            "id": vid,
            "filename": data["video"]["filename"],
            "start_local": data["video"]["start_local"],
            "end_local": data["video"]["end_local"],
            "duration_sec": data["video"]["duration_sec"],
            "offset_sec": offset_sec,
            "processed": True,
        })

        for event in data["events"]:
            merged_events.append({
                **event,
                "video_id": vid,
                "night_sec": event["timestamp_sec"] + offset_sec,
                "night_onset_sec": event["onset_sec"] + offset_sec,
            })

    # Sort by night-relative time
    merged_events.sort(key=lambda e: e["night_sec"])

    # Re-score PLMS across the full night
    # Set timestamp_sec and onset_sec to night-relative for series detection
    for e in merged_events:
        e["_orig_ts"] = e["timestamp_sec"]
        e["_orig_onset"] = e["onset_sec"]
        e["timestamp_sec"] = e["night_sec"]
        e["onset_sec"] = e["night_onset_sec"]

    plms_result = apply_plms_criteria(merged_events, night["total_hours"])

    # Restore original per-video timestamps (keep night_sec for hourly dist)
    for e in plms_result["events"]:
        if "_orig_ts" in e:
            e["timestamp_sec"] = e.pop("_orig_ts")
        if "_orig_onset" in e:
            e["onset_sec"] = e.pop("_orig_onset")

    # Compute cardiac arousal annotations (on-demand, uses HR data if available)
    arousal_result = compute_night_arousal(
        plms_result["events"], videos_info, HR_DIR, night["total_hours"]
    )
    plms_result["events"] = arousal_result["events"]
    arousal_summary = arousal_result.get("arousal_summary")

    # Compute hourly distribution
    total_night_sec = night["total_hours"] * 3600
    num_hours = max(1, math.ceil(total_night_sec / 3600))
    hourly = []

    for h in range(num_hours):
        bucket_start = h * 3600
        bucket_end = (h + 1) * 3600

        bucket_events = [
            e for e in plms_result["events"]
            if bucket_start <= e.get("night_sec", 0) < bucket_end
        ]

        plm_count = sum(1 for e in bucket_events if e.get("is_plm"))
        body_count = sum(1 for e in bucket_events if e.get("movement_type") == "body")
        other_count = len(bucket_events) - plm_count - body_count

        # Label in clock time
        hour_dt = night_start + timedelta(hours=h)
        label = hour_dt.strftime("%H:%M")

        hourly.append({
            "hour_offset": h,
            "label": label,
            "plm_count": plm_count,
            "body_count": body_count,
            "other_count": other_count,
            "total_count": len(bucket_events),
        })

    return {
        "night_date": night["night_date"],
        "start_local": night["start_local"],
        "end_local": night["end_local"],
        "total_hours": night["total_hours"],
        "video_ids": night["video_ids"],
        "videos": videos_info,
        "summary": plms_result["summary"],
        "arousal_summary": arousal_summary,
        "hourly_distribution": hourly,
        "events": plms_result["events"],
        "series": plms_result["series"],
    }
