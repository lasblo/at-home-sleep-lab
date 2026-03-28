#!/usr/bin/env python3
"""Evaluate motion detection pipeline against ground truth labels in PostgreSQL.

Outputs JSON to stdout with F1 score, precision, recall, and per-video breakdowns.
Progress and warnings go to stderr.

Usage (inside backend container):
    python evaluate.py
    python evaluate.py --verbose  # print per-match details
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import asyncpg

from pipeline import process_video
from plms import apply_plms_criteria

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://sleeplab:sleeplab@db:5432/sleeplab"
)
VIDEOS_DIR = Path(os.environ.get("VIDEOS_DIR", "/data/videos"))
IOU_THRESHOLD = 0.3
CLASSIFICATION_PENALTY = 0.5  # match quality multiplier for wrong type


def map_category_to_type(category: str) -> str | None:
    """Map label category to detector movement_type."""
    if category in ("leg", "arm"):
        return "limb"
    if category == "body":
        return "body"
    return None


def compute_iou(onset_a: float, dur_a: float, onset_b: float, dur_b: float) -> float:
    """Compute temporal IoU between two intervals."""
    start_a, end_a = onset_a, onset_a + dur_a
    start_b, end_b = onset_b, onset_b + dur_b
    intersection = max(0, min(end_a, end_b) - max(start_a, start_b))
    union = max(end_a, end_b) - min(start_a, start_b)
    if union <= 0:
        return 0.0
    return intersection / union


def match_detections_to_labels(
    detections: list[dict], labels: list[dict], verbose: bool = False
) -> dict:
    """Greedy IoU matching between detections and labels.

    Returns dict with tp, fp, fn, classification_correct, classification_total.
    """
    real_labels = [l for l in labels if map_category_to_type(l["category"]) is not None]
    artifact_only = len(real_labels) == 0 and len(labels) > 0

    if artifact_only:
        # All detections are false positives
        if verbose and detections:
            print(
                f"  Artifact-only video: {len(detections)} false positive(s)",
                file=sys.stderr,
            )
        return {
            "tp": 0.0,
            "fp": len(detections),
            "fn": 0,
            "classification_correct": 0,
            "classification_total": 0,
        }

    # Build IoU pairs
    pairs = []
    for di, det in enumerate(detections):
        for li, lab in enumerate(real_labels):
            iou = compute_iou(
                det["onset_sec"],
                det["duration_sec"],
                lab["timestamp_sec"],
                lab["duration_sec"],
            )
            if iou >= IOU_THRESHOLD:
                pairs.append((iou, di, li))

    # Greedy assignment (best IoU first)
    pairs.sort(key=lambda x: x[0], reverse=True)
    matched_dets = set()
    matched_labs = set()
    tp = 0.0
    classification_correct = 0
    classification_total = 0

    for iou, di, li in pairs:
        if di in matched_dets or li in matched_labs:
            continue
        matched_dets.add(di)
        matched_labs.add(li)

        det = detections[di]
        lab = real_labels[li]
        expected_type = map_category_to_type(lab["category"])
        actual_type = det.get("movement_type", "limb")

        classification_total += 1
        if expected_type == actual_type:
            tp += 1.0
            classification_correct += 1
        else:
            tp += 1.0 - CLASSIFICATION_PENALTY
            # still counts as partial TP

        if verbose:
            match_str = "OK" if expected_type == actual_type else "MISMATCH"
            print(
                f"  Match: det@{det['onset_sec']:.1f}s ({actual_type}) <-> "
                f"label@{lab['timestamp_sec']:.1f}s ({lab['category']}) "
                f"IoU={iou:.2f} [{match_str}]",
                file=sys.stderr,
            )

    fp = len(detections) - len(matched_dets)
    fn = len(real_labels) - len(matched_labs)

    if verbose:
        if fp > 0:
            unmatched = [d for i, d in enumerate(detections) if i not in matched_dets]
            for d in unmatched:
                print(
                    f"  FP: det@{d['onset_sec']:.1f}s ({d.get('movement_type', '?')})",
                    file=sys.stderr,
                )
        if fn > 0:
            unmatched = [l for i, l in enumerate(real_labels) if i not in matched_labs]
            for l in unmatched:
                print(
                    f"  FN: label@{l['timestamp_sec']:.1f}s ({l['category']})",
                    file=sys.stderr,
                )

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "classification_correct": classification_correct,
        "classification_total": classification_total,
    }


def evaluate_video(
    video_path: Path, labels: list[dict], verbose: bool = False
) -> dict | None:
    """Run detection pipeline on a video and compare to labels."""
    if not video_path.exists():
        print(f"  WARNING: video not found: {video_path}", file=sys.stderr)
        return None

    # Run pipeline
    result = process_video(str(video_path))
    events = result["events"]
    duration_sec = result["video_info"]["duration_sec"]
    duration_hours = duration_sec / 3600 if duration_sec > 0 else 1.0

    # Apply PLMS criteria to get movement_type classification
    plms_result = apply_plms_criteria(events, duration_hours)
    typed_events = plms_result["events"]

    # Match
    match_result = match_detections_to_labels(typed_events, labels, verbose=verbose)

    return {
        "detections": len(typed_events),
        "labels": len([l for l in labels if map_category_to_type(l["category"])]),
        **match_result,
    }


async def fetch_labeled_data(conn) -> dict[str, dict]:
    """Fetch all labeled videos with their labels from DB."""
    rows = await conn.fetch("""
        SELECT DISTINCT l.video_id, v.filename
        FROM labels l
        JOIN videos v ON l.video_id = v.id
    """)

    result = {}
    for row in rows:
        video_id = row["video_id"]
        labels = await conn.fetch(
            """
            SELECT timestamp_sec, duration_sec, category, notes
            FROM labels
            WHERE video_id = $1
            ORDER BY timestamp_sec
            """,
            video_id,
        )
        result[video_id] = {
            "filename": row["filename"],
            "labels": [dict(l) for l in labels],
        }

    return result


async def main():
    verbose = "--verbose" in sys.argv

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        labeled_data = await fetch_labeled_data(conn)
    finally:
        await conn.close()

    if not labeled_data:
        print(json.dumps({"error": "no labeled videos found"}))
        sys.exit(1)

    print(f"Evaluating {len(labeled_data)} labeled video(s)...", file=sys.stderr)

    total_tp = 0.0
    total_fp = 0
    total_fn = 0
    total_class_correct = 0
    total_class_total = 0
    per_video = []

    for i, (video_id, data) in enumerate(labeled_data.items(), 1):
        filename = data["filename"]
        labels = data["labels"]
        video_path = VIDEOS_DIR / filename

        print(f"  [{i}/{len(labeled_data)}] {filename}", file=sys.stderr)

        result = evaluate_video(video_path, labels, verbose=verbose)
        if result is None:
            continue

        total_tp += result["tp"]
        total_fp += result["fp"]
        total_fn += result["fn"]
        total_class_correct += result["classification_correct"]
        total_class_total += result["classification_total"]

        # Per-video F1
        p = (
            result["tp"] / (result["tp"] + result["fp"])
            if (result["tp"] + result["fp"]) > 0
            else 0
        )
        r = (
            result["tp"] / (result["tp"] + result["fn"])
            if (result["tp"] + result["fn"]) > 0
            else 0
        )
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0

        per_video.append(
            {
                "video_id": video_id,
                "filename": filename,
                "f1": round(f1, 4),
                "precision": round(p, 4),
                "recall": round(r, 4),
                "labels": result["labels"],
                "detections": result["detections"],
                "tp": result["tp"],
                "fp": result["fp"],
                "fn": result["fn"],
            }
        )

    # Aggregate
    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    f1 = (
        2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    )
    classification_accuracy = (
        total_class_correct / total_class_total if total_class_total > 0 else 0
    )

    output = {
        "f1": round(f1, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "loss": round(1 - f1, 4),
        "total_labels": int(total_tp + total_fn),
        "total_detections": int(total_tp + total_fp),
        "tp": round(total_tp, 2),
        "fp": int(total_fp),
        "fn": int(total_fn),
        "classification_accuracy": round(classification_accuracy, 4),
        "per_video": per_video,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
