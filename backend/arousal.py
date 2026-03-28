"""PLM Cardiac Arousal Detection.

Correlates PLM events with heart rate data to detect cardiac arousals.
"""

from bisect import bisect_left, bisect_right
from datetime import datetime

# Algorithm parameters
BASELINE_WINDOW_SEC = 10.0
MIN_BASELINE_READINGS = 3
DETECTION_WINDOW_SEC = 20.0
MAX_ONSET_DELAY_SEC = 10.0
MIN_SUSTAINED_READINGS = 2
STANDARD_BPM_THRESHOLD = 10.0
STANDARD_PCT_THRESHOLD = 0.10
STRICT_BPM_THRESHOLD = 10.0
STRICT_PCT_THRESHOLD = 0.15
RETURN_TO_BASELINE_BPM = 5.0


def compute_arousal_for_event(
    event_epoch: float,
    hr_epochs: list[float],
    hr_values: list[int],
) -> dict | None:
    """Detect cardiac arousal for a single PLM event."""
    n = len(hr_epochs)
    if n == 0:
        return None

    baseline_start = event_epoch - BASELINE_WINDOW_SEC
    bl_lo = bisect_left(hr_epochs, baseline_start)
    bl_hi = bisect_right(hr_epochs, event_epoch)
    baseline_readings = hr_values[bl_lo:bl_hi]

    if len(baseline_readings) < MIN_BASELINE_READINGS:
        return None

    baseline_hr = sum(baseline_readings) / len(baseline_readings)

    det_start = event_epoch
    det_end = event_epoch + DETECTION_WINDOW_SEC
    det_lo = bisect_left(hr_epochs, det_start)
    det_hi = bisect_right(hr_epochs, det_end)
    det_epochs = hr_epochs[det_lo:det_hi]
    det_hrs = hr_values[det_lo:det_hi]

    if len(det_hrs) < MIN_SUSTAINED_READINGS:
        return {
            "has_arousal": False,
            "pre_baseline_hr": round(baseline_hr, 1),
            "reason": "insufficient post-onset HR data",
        }

    standard_threshold = min(
        baseline_hr + STANDARD_BPM_THRESHOLD, baseline_hr * (1 + STANDARD_PCT_THRESHOLD)
    )
    strict_threshold = min(
        baseline_hr + STRICT_BPM_THRESHOLD, baseline_hr * (1 + STRICT_PCT_THRESHOLD)
    )

    if baseline_hr + STANDARD_BPM_THRESHOLD <= baseline_hr * (
        1 + STANDARD_PCT_THRESHOLD
    ):
        threshold_used = f"+{STANDARD_BPM_THRESHOLD:.0f}bpm"
    else:
        threshold_used = f"+{STANDARD_PCT_THRESHOLD * 100:.0f}%"

    first_exceed_idx = None
    for i, hr in enumerate(det_hrs):
        offset = det_epochs[i] - event_epoch
        if offset > MAX_ONSET_DELAY_SEC:
            break
        if hr >= standard_threshold:
            first_exceed_idx = i
            break

    if first_exceed_idx is None:
        any_exceed = any(hr >= standard_threshold for hr in det_hrs)
        max_hr_in_window = max(det_hrs) if det_hrs else 0
        return {
            "has_arousal": False,
            "pre_baseline_hr": round(baseline_hr, 1),
            "threshold": round(standard_threshold, 1),
            "threshold_used": threshold_used,
            "max_hr_in_window": int(max_hr_in_window),
            "reason": f"no HR exceeded threshold within {MAX_ONSET_DELAY_SEC}s onset window"
            + (
                f" (max {max_hr_in_window} at >{MAX_ONSET_DELAY_SEC}s)"
                if any_exceed
                else ""
            ),
        }

    onset_delay = det_epochs[first_exceed_idx] - event_epoch

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

    peak_hr = max(det_hrs[first_exceed_idx:])
    peak_idx_in_det = first_exceed_idx + det_hrs[first_exceed_idx:].index(peak_hr)

    return_search_end = event_epoch + 120
    ret_hi = bisect_right(hr_epochs, return_search_end)
    arousal_end_epoch = det_epochs[-1]

    for i in range(det_lo + first_exceed_idx, min(ret_hi, n)):
        if hr_values[i] <= baseline_hr + RETURN_TO_BASELINE_BPM:
            arousal_end_epoch = hr_epochs[i]
            break

    arousal_onset_epoch = det_epochs[first_exceed_idx]
    duration = arousal_end_epoch - arousal_onset_epoch

    magnitude_bpm = peak_hr - baseline_hr
    magnitude_pct = (
        (peak_hr - baseline_hr) / baseline_hr * 100 if baseline_hr > 0 else 0
    )
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


def compute_video_arousal(
    events: list[dict],
    video_start_local: str,
    hr_readings: list[dict] | None,
    video_duration_sec: float,
) -> tuple[list[dict], dict | None]:
    """Compute arousal for a single video's events.

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
        "plmai": round(arousal_count / recording_hours, 1)
        if recording_hours > 0
        else 0,
        "arousal_count": arousal_count,
        "arousal_percentage": round(arousal_count / plm_count * 100, 1)
        if plm_count > 0
        else 0,
        "mean_magnitude_bpm": round(sum(magnitudes) / len(magnitudes), 1)
        if magnitudes
        else 0,
        "mean_duration_sec": round(sum(durations) / len(durations), 1)
        if durations
        else 0,
        "strict_arousal_count": strict_count,
        "strict_arousal_percentage": round(strict_count / plm_count * 100, 1)
        if plm_count > 0
        else 0,
        "hr_coverage_pct": round(plm_with_hr / plm_count * 100, 1)
        if plm_count > 0
        else 0,
    }

    return events, summary
