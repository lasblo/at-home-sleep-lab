"""Group videos into nights and compute night-level analytics."""

import math
from datetime import datetime, timedelta

from plms import apply_plms_criteria
from arousal import compute_night_arousal

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

    sorted_vids = sorted(videos, key=lambda v: v["start_local"])
    nights = []
    current_night = None

    for v in sorted_vids:
        start_local = datetime.fromisoformat(v["start_local"])
        end_local = datetime.fromisoformat(v["end_local"])

        if current_night is None:
            current_night = _new_night(v, start_local, end_local)
            continue

        prev_end = datetime.fromisoformat(current_night["end_local"])
        gap_hours = (start_local - prev_end).total_seconds() / 3600

        if gap_hours < MAX_GAP_HOURS:
            current_night["video_ids"].append(v["id"])
            current_night["end_local"] = v["end_local"]
            current_night["total_hours"] += v["duration_sec"] / 3600
        else:
            current_night["total_hours"] = round(current_night["total_hours"], 2)
            nights.append(current_night)
            current_night = _new_night(v, start_local, end_local)

    if current_night:
        current_night["total_hours"] = round(current_night["total_hours"], 2)
        nights.append(current_night)

    return nights


def _new_night(video: dict, start_local: datetime, end_local: datetime) -> dict:
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


def compute_night_summary(night: dict, videos_info: list[dict],
                          events: list[dict], hr_readings: list[dict] | None = None) -> dict:
    """Compute full analytics for a single night.

    Args:
        night: night grouping dict (night_date, start_local, end_local, total_hours, video_ids)
        videos_info: list of video dicts with id, filename, start_local, end_local, duration_sec
        events: all events for this night's videos (from DB)
        hr_readings: optional HR readings for this night's time range (from DB)

    Merges events across videos and re-scores PLMS for the whole night.
    """
    night_start = datetime.fromisoformat(night["start_local"])

    # Add offset_sec and night_sec to events
    video_offsets = {}
    for v in videos_info:
        video_start = datetime.fromisoformat(v["start_local"])
        video_offsets[v["id"]] = (video_start - night_start).total_seconds()
        v["offset_sec"] = video_offsets[v["id"]]
        v["processed"] = True

    merged_events = []
    for event in events:
        vid = event.get("video_id")
        offset = video_offsets.get(vid, 0)
        merged_events.append({
            **event,
            "night_sec": event["timestamp_sec"] + offset,
            "night_onset_sec": event["onset_sec"] + offset,
        })

    merged_events.sort(key=lambda e: e["night_sec"])

    # Re-score PLMS across full night (temporarily use night-relative timestamps)
    for e in merged_events:
        e["_orig_ts"] = e["timestamp_sec"]
        e["_orig_onset"] = e["onset_sec"]
        e["timestamp_sec"] = e["night_sec"]
        e["onset_sec"] = e["night_onset_sec"]

    plms_result = apply_plms_criteria(merged_events, night["total_hours"])

    # Restore per-video timestamps
    for e in plms_result["events"]:
        if "_orig_ts" in e:
            e["timestamp_sec"] = e.pop("_orig_ts")
        if "_orig_onset" in e:
            e["onset_sec"] = e.pop("_orig_onset")

    # Compute cardiac arousal annotations
    arousal_result = compute_night_arousal(
        plms_result["events"], videos_info, hr_readings, night["total_hours"]
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
