import cv2
import numpy as np
from scipy.signal import find_peaks
from pathlib import Path

# --- Tunable parameters ---
FRAME_SKIP = 3          # Process every Nth frame (3 at 20fps ≈ 6.7Hz)
GAUSSIAN_KERNEL = 5     # Blur kernel for IR noise reduction
ROI_Y_FRACTION = 0.5    # ROI starts at 50% of frame height (bottom half)
GRID_COLS = 8           # Grid columns for spatial analysis
GRID_ROWS = 4           # Grid rows for spatial analysis
SMOOTH_WINDOW = 3       # Moving average window in samples
BASELINE_WINDOW_SEC = 60  # Rolling baseline window in seconds
MIN_SPATIAL_VARIANCE = 0.35  # Minimum spatial variance to consider as real movement
MIN_ACTIVE_CELLS = 0.03    # Minimum fraction of cells with above-average motion
PEAK_PROMINENCE = 0.03  # Minimum prominence for peak detection on localized signal
MIN_PEAK_DISTANCE_SEC = 3.0  # Minimum seconds between detected peaks (avoids double-counting)


def extract_motion_signal(video_path: str | Path, progress_cb=None) -> dict:
    """Extract motion signal using spatial variance to reject IR artifacts.

    Divides the frame into a grid and computes per-cell motion. Real body
    movement is localized (some cells active, most quiet), while IR camera
    artifacts produce uniform changes across all cells.

    Returns both the raw mean-diff signal (for visualization) and the
    localized motion signal (for detection).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    roi_y_start = int(height * ROI_Y_FRACTION)
    roi_h = height - roi_y_start

    cell_w = width // GRID_COLS
    cell_h = roi_h // GRID_ROWS

    sample_rate = fps / FRAME_SKIP
    timestamps = []
    raw_diffs = []          # Mean absolute diff (for visualization)
    localized_motion = []   # Spatially-filtered motion (for detection)
    spatial_variances = []  # For debugging/tuning

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
                overall_mean = float(np.mean(diff.astype(np.float32)))
                raw_diffs.append(overall_mean)

                # Compute per-cell motion
                cell_means = np.zeros(GRID_ROWS * GRID_COLS)
                for r in range(GRID_ROWS):
                    for c in range(GRID_COLS):
                        y1 = r * cell_h
                        y2 = (r + 1) * cell_h
                        x1 = c * cell_w
                        x2 = (c + 1) * cell_w
                        cell_means[r * GRID_COLS + c] = np.mean(diff[y1:y2, x1:x2].astype(np.float32))

                # Spatial variance: coefficient of variation across cells
                cell_mean_avg = cell_means.mean()
                spatial_var = float(np.std(cell_means) / (cell_mean_avg + 1e-8))
                spatial_variances.append(spatial_var)

                # Localized motion score:
                # Only count motion from cells that deviate significantly from the mean
                # This rejects uniform brightness changes (IR artifact)
                if cell_mean_avg > 0:
                    cell_deviations = cell_means - cell_mean_avg
                    # Sum positive deviations (cells with more motion than average)
                    positive_devs = np.clip(cell_deviations, 0, None)
                    raw_localized = float(positive_devs.sum())
                    # Weight by spatial variance: real movement (sv>1) amplified,
                    # IR artifact (sv<0.3) suppressed to near zero
                    sv_weight = max(0, spatial_var - 0.3)  # zero out artifact range
                    localized_score = raw_localized * sv_weight
                else:
                    localized_score = 0.0

                localized_motion.append(localized_score)
                timestamps.append(frame_idx / fps)

            prev_frame = blurred

        frame_idx += 1
        if progress_cb and frame_idx % (FRAME_SKIP * 300) == 0:
            progress_cb(frame_idx / frame_count)

    cap.release()

    raw_diffs = np.array(raw_diffs, dtype=np.float64)
    localized_motion = np.array(localized_motion, dtype=np.float64)

    return {
        "sample_rate_hz": sample_rate,
        "timestamps": timestamps,
        "raw_diffs": raw_diffs,
        "localized_motion": localized_motion,
        "spatial_variances": np.array(spatial_variances),
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


def _rolling_percentile(signal: np.ndarray, window: int, pct: int = 50) -> np.ndarray:
    """Compute rolling percentile for adaptive baseline using scipy."""
    from scipy.ndimage import percentile_filter
    return percentile_filter(signal, percentile=pct, size=window, mode="nearest")


def detect_events(motion_signal: dict) -> list[dict]:
    """Detect movement events using localized motion signal.

    Uses the spatial-variance-filtered signal that rejects IR camera artifacts.
    Only peaks where motion is spatially localized (not uniform across frame)
    are detected as movement events.
    """
    localized = motion_signal["localized_motion"]
    spatial_vars = motion_signal["spatial_variances"]
    timestamps = np.array(motion_signal["timestamps"])
    sample_rate = motion_signal["sample_rate_hz"]

    smoothed = _smooth(localized, SMOOTH_WINDOW)

    # Adaptive baseline using rolling median
    baseline_window = int(BASELINE_WINDOW_SEC * sample_rate)
    baseline = _rolling_percentile(smoothed, baseline_window, 50)

    # Signal above baseline
    above_baseline = smoothed - baseline
    above_baseline = np.clip(above_baseline, 0, None)

    # Normalize above-baseline signal for peak detection
    max_above = above_baseline.max() if above_baseline.max() > 0 else 1.0
    normalized = above_baseline / max_above

    min_distance = max(int(MIN_PEAK_DISTANCE_SEC * sample_rate), 1)

    # Detect peaks in the above-baseline localized motion
    peaks, properties = find_peaks(
        normalized,
        prominence=PEAK_PROMINENCE,
        distance=min_distance,
        height=0.02,  # minimum 2% of max signal
    )

    events = []
    for peak_idx in peaks:
        sv = float(spatial_vars[peak_idx]) if peak_idx < len(spatial_vars) else 0
        # Hard floor: reject events with very low spatial variance (likely artifacts)
        if sv < MIN_SPATIAL_VARIANCE:
            continue
        amplitude = float(smoothed[peak_idx])
        peak_time = float(timestamps[peak_idx])
        local_base = float(baseline[peak_idx])

        # Find onset/offset
        cross_threshold = local_base + (amplitude - local_base) * 0.15
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

        peak_height = float(normalized[peak_idx])
        peak_prominence = float(properties["prominences"][list(peaks).index(peak_idx)]) if "prominences" in properties else None

        events.append({
            "timestamp_sec": round(peak_time, 2),
            "onset_sec": round(onset_time, 2),
            "duration_sec": round(max(duration, min_dur), 2),
            "amplitude": round(amplitude, 6),
            "spatial_variance": round(sv, 3),
            "peak_index": int(peak_idx),
            "debug": {
                "raw_localized": round(float(localized[peak_idx]), 6),
                "smoothed": round(amplitude, 6),
                "baseline": round(local_base, 6),
                "above_baseline": round(float(above_baseline[peak_idx]), 6),
                "normalized_height": round(peak_height, 4),
                "prominence": round(peak_prominence, 4) if peak_prominence is not None else None,
                "onset_threshold": round(cross_threshold, 6),
                "sv_threshold": MIN_SPATIAL_VARIANCE,
                "sv_passed": sv >= MIN_SPATIAL_VARIANCE,
            },
        })

    return events


def process_video(video_path: str | Path, progress_cb=None) -> dict:
    """Full pipeline: extract motion signal + detect events for one video."""
    motion = extract_motion_signal(video_path, progress_cb)

    # Normalize localized motion for frontend display (0-1)
    loc = motion["localized_motion"]
    max_val = loc.max() if loc.max() > 0 else 1.0
    normalized_display = (loc / max_val).tolist()

    events = detect_events(motion)
    return {
        "motion_signal": {
            "sample_rate_hz": motion["sample_rate_hz"],
            "values": normalized_display,
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
