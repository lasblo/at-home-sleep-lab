"""PLM Cardiac Arousal Detection.

Correlates PLM events with heart rate data to detect cardiac arousals.
Pure functions — no side effects beyond reading HR JSONL files.
"""

import json
import math
from bisect import bisect_left, bisect_right
from datetime import datetime
from pathlib import Path

# Algorithm parameters
BASELINE_WINDOW_SEC = 10.0      # seconds before PLM onset for baseline HR
MIN_BASELINE_READINGS = 3       # minimum HR readings needed for baseline
DETECTION_WINDOW_SEC = 20.0     # seconds after PLM onset to scan for arousal
MAX_ONSET_DELAY_SEC = 10.0      # relaxed from 5s — WHOOP BLE has 1-3s latency on top of physiological delay
MIN_SUSTAINED_READINGS = 2      # consecutive readings above threshold (relaxed from 3 — 1Hz BLE has jitter)
STANDARD_BPM_THRESHOLD = 10.0   # absolute BPM increase
STANDARD_PCT_THRESHOLD = 0.10   # 10% increase
STRICT_BPM_THRESHOLD = 10.0     # strict: absolute minimum
STRICT_PCT_THRESHOLD = 0.15     # strict: 15% increase
RETURN_TO_BASELINE_BPM = 5.0    # within this many BPM = returned to baseline
CLUSTER_WINDOW_SEC = 300.0      # 5-minute window for cluster detection


def load_hr_for_range(hr_dir: Path, start_epoch: float, end_epoch: float) -> list[dict]:
    """Load HR readings from JSONL files covering the given epoch range."""
    readings = []
    if not hr_dir.exists():
        return readings

    for f in sorted(hr_dir.glob("*.jsonl")):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    epoch = r.get("epoch", 0)
                    if start_epoch - 60 <= epoch <= end_epoch + 60:
                        readings.append(r)
                except (json.JSONDecodeError, KeyError):
                    continue

    readings.sort(key=lambda r: r["epoch"])
    return readings


def compute_arousal_for_event(
    event_epoch: float,
    hr_epochs: list[float],
    hr_values: list[int],
) -> dict | None:
    """Detect cardiac arousal for a single PLM event.

    Args:
        event_epoch: absolute Unix timestamp of PLM onset
        hr_epochs: sorted list of HR reading timestamps
        hr_values: corresponding HR values (BPM)

    Returns:
        Arousal dict or None if insufficient HR data.
    """
    n = len(hr_epochs)
    if n == 0:
        return None

    # 1. Baseline: mean HR from 10 seconds before PLM onset
    baseline_start = event_epoch - BASELINE_WINDOW_SEC
    baseline_end = event_epoch
    bl_lo = bisect_left(hr_epochs, baseline_start)
    bl_hi = bisect_right(hr_epochs, baseline_end)
    baseline_readings = hr_values[bl_lo:bl_hi]

    if len(baseline_readings) < MIN_BASELINE_READINGS:
        return None

    baseline_hr = sum(baseline_readings) / len(baseline_readings)

    # 2. Detection window: 0-15 seconds after PLM onset
    det_start = event_epoch
    det_end = event_epoch + DETECTION_WINDOW_SEC
    det_lo = bisect_left(hr_epochs, det_start)
    det_hi = bisect_right(hr_epochs, det_end)
    det_epochs = hr_epochs[det_lo:det_hi]
    det_hrs = hr_values[det_lo:det_hi]

    if len(det_hrs) < MIN_SUSTAINED_READINGS:
        return {"has_arousal": False, "pre_baseline_hr": round(baseline_hr, 1), "reason": "insufficient post-onset HR data"}

    # 3. Thresholds
    standard_threshold = min(baseline_hr + STANDARD_BPM_THRESHOLD, baseline_hr * (1 + STANDARD_PCT_THRESHOLD))
    strict_threshold = min(baseline_hr + STRICT_BPM_THRESHOLD, baseline_hr * (1 + STRICT_PCT_THRESHOLD))

    # Determine which threshold is active
    if baseline_hr + STANDARD_BPM_THRESHOLD <= baseline_hr * (1 + STANDARD_PCT_THRESHOLD):
        threshold_used = f"+{STANDARD_BPM_THRESHOLD:.0f}bpm"
    else:
        threshold_used = f"+{STANDARD_PCT_THRESHOLD*100:.0f}%"

    # 4. Find first reading exceeding threshold within onset delay window
    first_exceed_idx = None
    for i, hr in enumerate(det_hrs):
        offset = det_epochs[i] - event_epoch
        if offset > MAX_ONSET_DELAY_SEC:
            break
        if hr >= standard_threshold:
            first_exceed_idx = i
            break

    if first_exceed_idx is None:
        # Check if there's any exceedance in the full window (for debug info)
        any_exceed = any(hr >= standard_threshold for hr in det_hrs)
        max_hr_in_window = max(det_hrs) if det_hrs else 0
        return {
            "has_arousal": False,
            "pre_baseline_hr": round(baseline_hr, 1),
            "threshold": round(standard_threshold, 1),
            "threshold_used": threshold_used,
            "max_hr_in_window": int(max_hr_in_window),
            "reason": f"no HR exceeded threshold within {MAX_ONSET_DELAY_SEC}s onset window"
                      + (f" (max {max_hr_in_window} at >{MAX_ONSET_DELAY_SEC}s)" if any_exceed else ""),
        }

    onset_delay = det_epochs[first_exceed_idx] - event_epoch

    # 5. Sustained check: scan from first exceedance through entire window
    #    Supports biphasic: brief spike → dip → sustained elevation
    #    Count total readings above threshold, and longest consecutive run
    consecutive = 0
    max_consecutive = 0
    total_above = 0
    for i in range(first_exceed_idx, len(det_hrs)):
        if det_hrs[i] >= standard_threshold:
            consecutive += 1
            total_above += 1
            max_consecutive = max(max_consecutive, consecutive)
        else:
            consecutive = 0

    # Accept if either: consecutive sustained OR total above threshold is significant
    # (biphasic pattern: spike-dip-spike still counts if enough readings above threshold)
    sustained_ok = max_consecutive >= MIN_SUSTAINED_READINGS or total_above >= 3

    if not sustained_ok:
        return {
            "has_arousal": False,
            "pre_baseline_hr": round(baseline_hr, 1),
            "threshold": round(standard_threshold, 1),
            "threshold_used": threshold_used,
            "onset_delay_sec": round(onset_delay, 1),
            "max_consecutive": max_consecutive,
            "reason": f"only {max_consecutive} consecutive readings above threshold (need {MIN_SUSTAINED_READINGS})",
        }

    # 7. Arousal confirmed — compute peak and duration
    peak_hr = max(det_hrs[first_exceed_idx:])
    peak_idx_in_det = first_exceed_idx + det_hrs[first_exceed_idx:].index(peak_hr)

    # Scan for return to baseline (extend beyond detection window)
    return_search_end = event_epoch + 120  # look up to 2 minutes out
    ret_hi = bisect_right(hr_epochs, return_search_end)
    arousal_end_epoch = det_epochs[-1]  # default: end of detection window

    for i in range(det_lo + first_exceed_idx, min(ret_hi, n)):
        if hr_values[i] <= baseline_hr + RETURN_TO_BASELINE_BPM:
            arousal_end_epoch = hr_epochs[i]
            break

    arousal_onset_epoch = det_epochs[first_exceed_idx]
    duration = arousal_end_epoch - arousal_onset_epoch

    magnitude_bpm = peak_hr - baseline_hr
    magnitude_pct = (peak_hr - baseline_hr) / baseline_hr * 100 if baseline_hr > 0 else 0

    # Check strict threshold
    strict_met = peak_hr >= strict_threshold

    return {
        "has_arousal": True,
        "pre_baseline_hr": round(baseline_hr, 1),
        "peak_hr": int(peak_hr),
        "magnitude_bpm": round(magnitude_bpm, 1),
        "magnitude_pct": round(magnitude_pct, 1),
        "onset_delay_sec": round(onset_delay, 1),
        "duration_sec": round(duration, 1),
        "threshold_used": threshold_used,
        "threshold_value": round(standard_threshold, 1),
        "strict_threshold_met": strict_met,
    }


def detect_arousal_clusters(arousal_events: list[dict], window_sec: float = CLUSTER_WINDOW_SEC) -> list[dict]:
    """Detect clusters of consecutive PLM arousals within time windows.

    Args:
        arousal_events: list of events with arousal.has_arousal=True, sorted by epoch.
        window_sec: maximum gap between events in a cluster.

    Returns:
        List of cluster dicts.
    """
    if not arousal_events:
        return []

    clusters = []
    current = [arousal_events[0]]

    for ev in arousal_events[1:]:
        gap = ev["_arousal_epoch"] - current[-1]["_arousal_epoch"]
        if gap <= window_sec:
            current.append(ev)
        else:
            if len(current) >= 2:
                clusters.append(_build_cluster(current))
            current = [ev]

    if len(current) >= 2:
        clusters.append(_build_cluster(current))

    return clusters


def _build_cluster(events: list[dict]) -> dict:
    magnitudes = [e["arousal"]["magnitude_bpm"] for e in events]
    baselines = [e["arousal"]["pre_baseline_hr"] for e in events]
    # Escalating: later arousals start from higher baselines
    escalating = all(baselines[i] >= baselines[i - 1] - 2 for i in range(1, len(baselines))) and baselines[-1] > baselines[0] + 2

    return {
        "start_sec": events[0].get("night_sec", events[0].get("timestamp_sec", 0)),
        "end_sec": events[-1].get("night_sec", events[-1].get("timestamp_sec", 0)),
        "event_count": len(events),
        "mean_magnitude_bpm": round(sum(magnitudes) / len(magnitudes), 1),
        "max_magnitude_bpm": round(max(magnitudes), 1),
        "escalating": escalating,
        "baseline_drift_bpm": round(baselines[-1] - baselines[0], 1),
    }


def compute_night_arousal(
    events: list[dict],
    videos_info: list[dict],
    hr_readings: list[dict] | None,
    recording_hours: float,
) -> dict:
    """Compute arousal annotations for all PLM events in a night.

    Args:
        events: merged night events (with video_id, onset_sec video-relative)
        videos_info: list of video dicts with start_local, id
        hr_readings: list of HR readings (epoch, hr) for the night, or None
        recording_hours: total recording hours for PLMAI calculation

    Returns:
        dict with 'events' (annotated) and 'arousal_summary'
    """
    # Build video start epoch lookup
    video_epoch_map = {}
    for v in videos_info:
        try:
            dt = datetime.fromisoformat(v["start_local"])
            video_epoch_map[v["id"]] = dt.timestamp()
        except (ValueError, KeyError):
            continue

    if not video_epoch_map:
        return {"events": events, "arousal_summary": None}

    if not hr_readings:
        # No HR data — mark all events as no-data
        for e in events:
            if e.get("is_plm"):
                e["arousal"] = None
        return {"events": events, "arousal_summary": None}

    # Pre-sort HR data for bisect queries
    hr_epochs = [r["epoch"] for r in hr_readings]
    hr_values = [r["hr"] for r in hr_readings]

    # Annotate each PLM event
    arousal_count = 0
    strict_arousal_count = 0
    magnitudes = []
    durations = []
    arousal_events_for_clustering = []
    plm_count = 0
    plm_with_hr = 0

    for e in events:
        if not e.get("is_plm"):
            continue

        plm_count += 1
        video_id = e.get("video_id")
        video_start_epoch = video_epoch_map.get(video_id)

        if video_start_epoch is None:
            e["arousal"] = None
            continue

        event_epoch = video_start_epoch + e["onset_sec"]

        # Check if we have HR coverage for this event
        bl_lo = bisect_left(hr_epochs, event_epoch - BASELINE_WINDOW_SEC)
        bl_hi = bisect_right(hr_epochs, event_epoch)
        if bl_hi - bl_lo < MIN_BASELINE_READINGS:
            e["arousal"] = None
            continue

        plm_with_hr += 1
        result = compute_arousal_for_event(event_epoch, hr_epochs, hr_values)

        if result is None:
            e["arousal"] = None
            continue

        e["arousal"] = result

        if result.get("has_arousal"):
            arousal_count += 1
            magnitudes.append(result["magnitude_bpm"])
            durations.append(result["duration_sec"])
            if result.get("strict_threshold_met"):
                strict_arousal_count += 1

            # Track for clustering
            e["_arousal_epoch"] = event_epoch
            arousal_events_for_clustering.append(e)

    # Detect clusters
    clusters = detect_arousal_clusters(arousal_events_for_clustering)

    # Clean up temp fields
    for e in arousal_events_for_clustering:
        e.pop("_arousal_epoch", None)

    # Build summary
    hr_coverage_pct = round(plm_with_hr / plm_count * 100, 1) if plm_count > 0 else 0

    arousal_summary = {
        "plmai": round(arousal_count / recording_hours, 1) if recording_hours > 0 else 0,
        "arousal_count": arousal_count,
        "arousal_percentage": round(arousal_count / plm_count * 100, 1) if plm_count > 0 else 0,
        "mean_magnitude_bpm": round(sum(magnitudes) / len(magnitudes), 1) if magnitudes else 0,
        "mean_duration_sec": round(sum(durations) / len(durations), 1) if durations else 0,
        "max_magnitude_bpm": round(max(magnitudes), 1) if magnitudes else 0,
        "strict_arousal_count": strict_arousal_count,
        "strict_arousal_percentage": round(strict_arousal_count / plm_count * 100, 1) if plm_count > 0 else 0,
        "cluster_count": len(clusters),
        "clusters": clusters,
        "hr_coverage_pct": hr_coverage_pct,
        "plm_with_hr_data": plm_with_hr,
        "plm_total": plm_count,
    }

    return {"events": events, "arousal_summary": arousal_summary}


def compute_video_arousal(
    events: list[dict],
    video_start_local: str,
    hr_readings: list[dict] | None,
    video_duration_sec: float,
) -> tuple[list[dict], dict | None]:
    """Compute arousal for a single video's events.

    Args:
        hr_readings: list of HR readings (epoch, hr) for the video's time range, or None

    Returns (annotated_events, arousal_summary or None).
    """
    try:
        video_start_epoch = datetime.fromisoformat(video_start_local).timestamp()
    except ValueError:
        return events, None

    if not hr_readings:
        for e in events:
            if e.get("is_plm"):
                e["arousal"] = None
        return events, None

    hr_epochs = [r["epoch"] for r in hr_readings]
    hr_values = [r["hr"] for r in hr_readings]

    plm_count = 0
    plm_with_hr = 0
    arousal_count = 0
    strict_count = 0
    magnitudes = []
    durations = []

    recording_hours = video_duration_sec / 3600.0

    for e in events:
        if not e.get("is_plm"):
            continue

        plm_count += 1
        event_epoch = video_start_epoch + e["onset_sec"]

        bl_lo = bisect_left(hr_epochs, event_epoch - BASELINE_WINDOW_SEC)
        bl_hi = bisect_right(hr_epochs, event_epoch)
        if bl_hi - bl_lo < MIN_BASELINE_READINGS:
            e["arousal"] = None
            continue

        plm_with_hr += 1
        result = compute_arousal_for_event(event_epoch, hr_epochs, hr_values)
        e["arousal"] = result

        if result and result.get("has_arousal"):
            arousal_count += 1
            magnitudes.append(result["magnitude_bpm"])
            durations.append(result["duration_sec"])
            if result.get("strict_threshold_met"):
                strict_count += 1

    if plm_count == 0:
        return events, None

    summary = {
        "plmai": round(arousal_count / recording_hours, 1) if recording_hours > 0 else 0,
        "arousal_count": arousal_count,
        "arousal_percentage": round(arousal_count / plm_count * 100, 1) if plm_count > 0 else 0,
        "mean_magnitude_bpm": round(sum(magnitudes) / len(magnitudes), 1) if magnitudes else 0,
        "mean_duration_sec": round(sum(durations) / len(durations), 1) if durations else 0,
        "strict_arousal_count": strict_count,
        "strict_arousal_percentage": round(strict_count / plm_count * 100, 1) if plm_count > 0 else 0,
        "hr_coverage_pct": round(plm_with_hr / plm_count * 100, 1) if plm_count > 0 else 0,
    }

    return events, summary
