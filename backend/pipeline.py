import cv2
import numpy as np
from scipy.signal import find_peaks
from pathlib import Path

# --- Tunable parameters ---
FRAME_SKIP = 3          # Process every Nth frame (3 at 20fps ≈ 6.7Hz)
GAUSSIAN_KERNEL = 5     # Blur kernel for IR noise reduction
ROI_Y_FRACTION = 0.5    # ROI starts at 50% of frame height (bottom half)
SMOOTH_WINDOW = 3       # Moving average window in samples for signal smoothing
BASELINE_WINDOW_SEC = 30  # Rolling baseline window in seconds
PEAK_MIN_HEIGHT_FACTOR = 3.0  # Peak must be N * rolling baseline (p25)
PEAK_PROMINENCE_FACTOR = 1.0  # Minimum prominence relative to local baseline
MIN_PEAK_DISTANCE_SEC = 2.0   # Minimum seconds between detected peaks
IR_ARTIFACT_PERIOD_SEC = 5.0  # IR camera cycling artifact period
IR_ARTIFACT_TOLERANCE_SEC = 0.3  # Timing tolerance for artifact detection


def extract_motion_signal(video_path: str | Path, progress_cb=None) -> dict:
    """Extract motion magnitude time series using mean absolute frame difference.

    Uses mean pixel diff (not thresholded count) to preserve subtle movement
    amplitudes that are critical for detecting periodic limb movements under blankets.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    roi_y_start = int(height * ROI_Y_FRACTION)

    sample_rate = fps / FRAME_SKIP
    timestamps = []
    magnitudes = []
    prev_frame = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % FRAME_SKIP == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
            roi = gray[roi_y_start:, :]
            blurred = cv2.GaussianBlur(roi, (GAUSSIAN_KERNEL, GAUSSIAN_KERNEL), 0)

            if prev_frame is not None:
                diff = cv2.absdiff(blurred, prev_frame)
                # Use mean absolute diff — preserves actual motion amplitude
                magnitude = float(np.mean(diff.astype(np.float32)))
                timestamps.append(frame_idx / fps)
                magnitudes.append(magnitude)

            prev_frame = blurred

        frame_idx += 1
        if progress_cb and frame_idx % (FRAME_SKIP * 300) == 0:
            progress_cb(frame_idx / frame_count)

    cap.release()

    magnitudes = np.array(magnitudes, dtype=np.float64)

    return {
        "sample_rate_hz": sample_rate,
        "timestamps": timestamps,
        "raw_values": magnitudes,  # keep raw for detection
        "fps": fps,
        "frame_count": frame_count,
        "width": width,
        "height": height,
    }


def _smooth(signal: np.ndarray, window: int) -> np.ndarray:
    if window <= 1 or len(signal) < window:
        return signal
    kernel = np.ones(window) / window
    return np.convolve(signal, kernel, mode="same")


def _rolling_baseline(signal: np.ndarray, window: int, percentile: int = 25) -> np.ndarray:
    """Compute rolling percentile baseline to adapt to changing noise floors."""
    baseline = np.empty_like(signal)
    half = window // 2
    for i in range(len(signal)):
        start = max(0, i - half)
        end = min(len(signal), i + half)
        baseline[i] = np.percentile(signal[start:end], percentile)
    return baseline


def detect_events(motion_signal: dict) -> list[dict]:
    """Detect movement events using adaptive baseline peak detection.

    Uses rolling baseline to handle varying noise floors across the night,
    and mean-diff signal to catch subtle periodic movements under blankets.
    """
    raw = motion_signal["raw_values"]
    timestamps = np.array(motion_signal["timestamps"])
    sample_rate = motion_signal["sample_rate_hz"]

    smoothed = _smooth(raw, SMOOTH_WINDOW)

    # Adaptive rolling baseline
    baseline_window = int(BASELINE_WINDOW_SEC * sample_rate)
    baseline = _rolling_baseline(smoothed, baseline_window)

    # Signal above baseline
    above = smoothed - baseline
    above = np.clip(above, 0, None)

    # Dynamic threshold: peak must be well above local baseline
    min_height = baseline * PEAK_MIN_HEIGHT_FACTOR
    # Ensure a minimum absolute floor to avoid detecting pure noise
    noise_floor = np.percentile(smoothed, 50) * 0.5
    min_height = np.maximum(min_height, noise_floor)

    min_distance = max(int(MIN_PEAK_DISTANCE_SEC * sample_rate), 1)

    # Detect peaks in the raw smoothed signal (not above-baseline)
    # using the adaptive height threshold
    peaks, properties = find_peaks(
        smoothed,
        height=min_height,
        prominence=noise_floor * PEAK_PROMINENCE_FACTOR,
        distance=min_distance,
    )

    # Build raw event list
    raw_events = []
    for peak_idx in peaks:
        amplitude = float(smoothed[peak_idx])
        peak_time = float(timestamps[peak_idx])
        local_base = float(baseline[peak_idx])

        # Find onset/offset: where signal drops to baseline level
        cross_threshold = local_base * 1.1
        onset_idx = peak_idx
        while onset_idx > 0 and smoothed[onset_idx - 1] > cross_threshold:
            onset_idx -= 1

        offset_idx = peak_idx
        while offset_idx < len(smoothed) - 1 and smoothed[offset_idx + 1] > cross_threshold:
            offset_idx += 1

        onset_time = float(timestamps[max(onset_idx, 0)])
        offset_time = float(timestamps[min(offset_idx, len(timestamps) - 1)])
        duration = offset_time - onset_time
        min_dur = 2.0 / sample_rate

        raw_events.append({
            "timestamp_sec": round(peak_time, 2),
            "onset_sec": round(onset_time, 2),
            "duration_sec": round(max(duration, min_dur), 2),
            "amplitude": round(amplitude, 6),
            "peak_index": int(peak_idx),
        })

    # Filter out IR camera artifact: regular ~5s periodic signal
    # The artifact produces peaks at very consistent intervals and amplitudes.
    # Real movements are irregular in both timing and amplitude.
    events = _filter_ir_artifact(raw_events)

    return events


def _filter_ir_artifact(events: list[dict]) -> list[dict]:
    """Remove peaks caused by IR camera cycling artifact.

    The artifact produces peaks at exactly ~5.0s intervals with very uniform
    amplitude. Real limb movements have variable timing and amplitude.
    We detect runs of consecutive peaks that match the artifact pattern
    and remove them.
    """
    if len(events) < 3:
        return events

    # For each event, check if it's part of an artifact run
    n = len(events)
    is_artifact = [False] * n

    # Check each pair of consecutive events for artifact-like interval
    artifact_interval = [False] * n
    for i in range(1, n):
        interval = events[i]["timestamp_sec"] - events[i - 1]["timestamp_sec"]
        if abs(interval - IR_ARTIFACT_PERIOD_SEC) < IR_ARTIFACT_TOLERANCE_SEC:
            artifact_interval[i] = True

    # Find runs of artifact-interval peaks (at least 3 consecutive)
    # Also check amplitude consistency within runs
    i = 0
    while i < n:
        # Find start of potential artifact run
        if i + 1 < n and artifact_interval[i + 1]:
            run_start = i
            run_end = i + 1
            while run_end + 1 < n and artifact_interval[run_end + 1]:
                run_end += 1

            run_len = run_end - run_start + 1
            if run_len >= 3:
                # Check amplitude consistency: artifact has very uniform amplitude
                run_amps = [events[j]["amplitude"] for j in range(run_start, run_end + 1)]
                amp_mean = np.mean(run_amps)
                amp_std = np.std(run_amps)
                # Coefficient of variation < 15% = very uniform = artifact
                cv = amp_std / amp_mean if amp_mean > 0 else 0
                if cv < 0.15:
                    for j in range(run_start, run_end + 1):
                        is_artifact[j] = True

            i = run_end + 1
        else:
            i += 1

    return [e for e, art in zip(events, is_artifact) if not art]


def process_video(video_path: str | Path, progress_cb=None) -> dict:
    """Full pipeline: extract motion signal + detect events for one video."""
    motion = extract_motion_signal(video_path, progress_cb)
    raw = motion["raw_values"]

    # Normalize for frontend display (0-1)
    max_val = raw.max() if raw.max() > 0 else 1.0
    normalized = (raw / max_val).tolist()

    events = detect_events(motion)
    return {
        "motion_signal": {
            "sample_rate_hz": motion["sample_rate_hz"],
            "values": normalized,
        },
        "events": events,
        "video_info": {
            "fps": motion["fps"],
            "frame_count": motion["frame_count"],
            "width": motion["width"],
            "height": motion["height"],
            "duration_sec": motion["frame_count"] / motion["fps"] if motion["fps"] > 0 else 0,
        },
    }
