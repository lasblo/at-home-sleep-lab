#!/usr/bin/env python3
"""Seed 30 nights of realistic sample data for the sleep analysis dashboard."""

import asyncio
import hashlib
import json
import math
import os
import random
import uuid
from datetime import datetime, date, timedelta, timezone

import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://sleeplab:sleeplab@localhost:5432/sleeplab"
)

# Import schema from db module (same directory)
from db import SCHEMA

# ── Deterministic seed for reproducibility ─────────────────────────
random.seed(42)

# ── Constants ──────────────────────────────────────────────────────
NUM_NIGHTS = 30
START_DATE = date(2026, 2, 26)
TZ = timezone(timedelta(hours=-5))  # EST
FPS = 20.0
WIDTH = 1920
HEIGHT = 1080
AROUSAL_RATE = 0.35  # 35% of PLMs trigger arousal on HR nights


# ── PLMI narrative arc ─────────────────────────────────────────────
def target_plmi(night_index: int) -> float:
    """Return target PLMI following a narrative arc."""
    if night_index < 7:
        # Baseline: mild (8-14)
        base = 11.0
    elif night_index < 14:
        # Worsening (12-20)
        base = 16.0
    elif night_index < 20:
        # Peak (18-28)
        base = 23.0
    else:
        # Improvement (6-15)
        progress = (night_index - 20) / 10
        base = 15.0 - progress * 7.0

    return max(3.0, random.gauss(base, base * 0.15))


# ── ID generators ─────────────────────────────────────────────────
def make_session_id(night_index: int) -> str:
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"seed-night-{night_index}").hex[:12]


def make_video_id(filename: str) -> str:
    return hashlib.md5(filename.encode()).hexdigest()[:10]


# ── Event generators ──────────────────────────────────────────────
def generate_plm_series(
    video_start_sec: float,
    video_duration_sec: float,
    target_plm_count: int,
    series_id_offset: int,
) -> tuple[list[dict], list[dict]]:
    """Generate PLM events organized into series for one video.

    Returns (events, series_info_list).
    """
    if target_plm_count < 4:
        return [], []

    events = []
    series_list = []
    series_count = max(1, target_plm_count // 6)
    plms_remaining = target_plm_count

    for s_idx in range(series_count):
        if plms_remaining < 4:
            break

        events_in_series = min(random.randint(4, 8), plms_remaining)
        plms_remaining -= events_in_series

        # Start time weighted toward first half of video
        max_start = video_duration_sec - events_in_series * 90 - 60
        if max_start < 10:
            max_start = 10
        series_start = random.uniform(10, max(11, max_start))
        # Weight toward earlier in the video
        series_start *= random.uniform(0.3, 1.0)
        series_start = max(5, min(series_start, video_duration_sec - 120))

        series_id = series_id_offset + s_idx + 1
        series_events = []
        current_onset = series_start

        for e_idx in range(events_in_series):
            if e_idx > 0:
                interval = max(5.0, min(85.0, random.gauss(25.0, 8.0)))
                current_onset += interval

            if current_onset >= video_duration_sec - 5:
                break

            duration = max(0.5, min(9.0, random.gauss(2.0, 1.2)))
            amplitude = max(1.0, min(24.0, random.gauss(8.0, 4.0)))
            sv = max(0.4, min(3.0, random.gauss(1.5, 0.5)))
            timestamp = current_onset + duration * 0.4  # peak slightly after onset

            evt = {
                "timestamp_sec": round(timestamp, 2),
                "onset_sec": round(current_onset, 2),
                "duration_sec": round(duration, 2),
                "amplitude": round(amplitude, 2),
                "spatial_variance": round(sv, 3),
                "movement_type": "limb",
                "is_plm": True,
                "series_id": series_id,
            }
            series_events.append(evt)

        if len(series_events) >= 4:
            events.extend(series_events)
            intervals = []
            for i in range(1, len(series_events)):
                intervals.append(
                    series_events[i]["onset_sec"] - series_events[i - 1]["onset_sec"]
                )
            series_list.append(
                {
                    "id": series_id,
                    "event_count": len(series_events),
                    "mean_interval_sec": round(sum(intervals) / len(intervals), 1)
                    if intervals
                    else 0,
                    "start_sec": series_events[0]["timestamp_sec"],
                    "end_sec": series_events[-1]["timestamp_sec"],
                }
            )

    return events, series_list


def generate_body_movements(video_duration_sec: float, count: int) -> list[dict]:
    """Generate body movement events (position changes)."""
    events = []
    for _ in range(count):
        onset = random.uniform(30, video_duration_sec - 30)
        duration = max(3.5, min(10.0, random.gauss(5.0, 2.0)))
        amplitude = max(26.0, min(60.0, random.gauss(35.0, 8.0)))
        sv = max(0.5, min(3.5, random.gauss(2.0, 0.5)))
        timestamp = onset + duration * 0.4

        events.append(
            {
                "timestamp_sec": round(timestamp, 2),
                "onset_sec": round(onset, 2),
                "duration_sec": round(duration, 2),
                "amplitude": round(amplitude, 2),
                "spatial_variance": round(sv, 3),
                "movement_type": "body",
                "is_plm": False,
                "series_id": None,
            }
        )
    return events


def generate_noise_limb_events(video_duration_sec: float, count: int) -> list[dict]:
    """Generate non-PLM limb events (too short chain, scattered)."""
    events = []
    for _ in range(count):
        onset = random.uniform(20, video_duration_sec - 20)
        duration = max(0.3, min(10.0, random.gauss(1.5, 1.0)))
        amplitude = max(0.5, min(24.0, random.gauss(5.0, 3.0)))
        sv = max(0.3, min(2.5, random.gauss(1.2, 0.4)))
        timestamp = onset + duration * 0.4

        events.append(
            {
                "timestamp_sec": round(timestamp, 2),
                "onset_sec": round(onset, 2),
                "duration_sec": round(duration, 2),
                "amplitude": round(amplitude, 2),
                "spatial_variance": round(sv, 3),
                "movement_type": "limb",
                "is_plm": False,
                "series_id": None,
            }
        )
    return events


# ── Debug JSONB builder ───────────────────────────────────────────
def make_debug(event: dict, prev_onset: float | None = None) -> dict:
    amp = event["amplitude"]
    dur = event["duration_sec"]
    mv = event["movement_type"]
    is_plm = event["is_plm"]
    series_id = event["series_id"]

    interval = (
        round(event["onset_sec"] - prev_onset, 2) if prev_onset is not None else None
    )
    interval_valid = None
    interval_reason = "first candidate"
    if interval is not None:
        interval_valid = 4.5 <= interval <= 90.0
        if interval < 4.5:
            interval_reason = f"{interval:.1f}s < 4.5s minimum"
        elif interval > 90.0:
            interval_reason = f"{interval:.1f}s > 90.0s maximum"
        else:
            interval_reason = None

    body_reason = None
    plm_reject_reason = None
    if mv == "body":
        body_reason = f"amp {amp:.1f} > 25.0 AND dur {dur:.2f}s > 3.0s"
        plm_reject_reason = "body movement (excluded from PLM series)"
    elif dur < 0.4:
        plm_reject_reason = f"duration {dur:.2f}s < 0.4s minimum"
    elif dur > 10.0:
        plm_reject_reason = f"duration {dur:.2f}s > 10.0s maximum"

    plm_eligible = mv == "limb" and 0.4 <= dur <= 10.0

    if is_plm:
        series_reason = f"member of series {series_id}"
    elif plm_reject_reason:
        series_reason = plm_reject_reason
    else:
        series_reason = "chain too short (< 4 consecutive events with valid intervals)"

    return {
        "raw_localized": round(amp * random.gauss(1.1, 0.1), 3),
        "smoothed": round(amp, 3),
        "baseline": round(amp * 0.1, 3),
        "above_baseline": round(amp * 0.9, 3),
        "normalized_height": round(min(1.0, amp / 25.0), 3),
        "prominence": round(min(0.8, amp / 30.0), 3),
        "sv_passed": True,
        "sv_threshold": 0.35,
        "body_classification": mv,
        "body_reason": body_reason,
        "plm_eligible": plm_eligible,
        "plm_reject_reason": plm_reject_reason,
        "interval_to_prev_sec": interval,
        "interval_valid": interval_valid,
        "interval_reason": interval_reason,
        "plm_series_reason": series_reason,
    }


# ── Arousal JSONB builder ─────────────────────────────────────────
def make_arousal(baseline_hr: float, has_arousal: bool) -> dict:
    if not has_arousal:
        max_hr = baseline_hr + random.randint(2, 8)
        return {
            "has_arousal": False,
            "pre_baseline_hr": round(baseline_hr, 1),
            "threshold": round(baseline_hr + 10, 1),
            "threshold_used": "+10bpm",
            "max_hr_in_window": int(max_hr),
            "reason": "no HR exceeded threshold within 10.0s onset window",
        }

    peak_hr = baseline_hr + random.randint(10, 25)
    magnitude_bpm = peak_hr - baseline_hr
    magnitude_pct = magnitude_bpm / baseline_hr * 100 if baseline_hr > 0 else 0
    onset_delay = max(0.5, min(9.5, random.gauss(3.0, 1.5)))
    duration = max(3.0, min(30.0, random.gauss(12.0, 4.0)))

    return {
        "has_arousal": True,
        "pre_baseline_hr": round(baseline_hr, 1),
        "peak_hr": int(peak_hr),
        "magnitude_bpm": round(magnitude_bpm, 1),
        "magnitude_pct": round(magnitude_pct, 1),
        "onset_delay_sec": round(onset_delay, 1),
        "duration_sec": round(duration, 1),
        "threshold_used": "+10bpm",
        "threshold_value": round(baseline_hr + 10, 1),
        "strict_threshold_met": magnitude_bpm >= baseline_hr * 0.15,
    }


# ── Motion signal generator ──────────────────────────────────────
def generate_motion_signal(duration_sec: float, events: list[dict]) -> list[float]:
    """Generate a synthetic motion signal with Gaussian bumps at event times."""
    n = int(duration_sec)
    # Baseline noise
    values = [max(0, random.gauss(0.02, 0.008)) for _ in range(n)]

    # Add Gaussian bumps at event locations
    for evt in events:
        ts = evt["timestamp_sec"]
        amp = evt["amplitude"]
        dur = evt["duration_sec"]
        sigma = max(0.5, dur / 2.5)
        # Normalized amplitude for signal (events have amp 0.5-60, signal is 0-1)
        norm_amp = min(0.9, amp / 30.0)

        start = max(0, int(ts - sigma * 3))
        end = min(n, int(ts + sigma * 3))
        for i in range(start, end):
            bump = norm_amp * math.exp(-0.5 * ((i - ts) / sigma) ** 2)
            values[i] += bump

    # Normalize to [0, 1]
    peak = max(values) if values else 1.0
    if peak > 0:
        values = [min(1.0, v / peak) for v in values]

    return [round(v, 4) for v in values]


# ── HR reading generator ─────────────────────────────────────────
def generate_hr_readings(
    session_start_epoch: float,
    duration_sec: float,
    arousal_events: list[dict],
) -> list[tuple]:
    """Generate realistic nocturnal HR readings (~1 per second).

    Returns list of (ts_iso, epoch, hr, device) tuples.
    """
    readings = []
    n = int(duration_sec)

    for sec in range(n):
        epoch = session_start_epoch + sec
        progress = sec / duration_sec

        # Circadian HR curve
        if progress < 0.05:
            # Settling: 75 → 68
            base = 75 - progress * 140
        elif progress < 0.10:
            # Light sleep transition: 68 → 60
            base = 68 - (progress - 0.05) * 160
        elif progress < 0.85:
            # Deep sleep with 90-min NREM cycles
            cycle = math.sin(2 * math.pi * sec / 5400)
            base = 55 + cycle * 3
        else:
            # Pre-wake
            base = 55 + (progress - 0.85) * 80

        hr = base + random.gauss(0, 1.5)

        # Add arousal spikes
        for evt in arousal_events:
            evt_sec = evt["_absolute_sec"]
            arousal = evt.get("arousal", {})
            if not arousal or not arousal.get("has_arousal"):
                continue
            a_dur = arousal.get("duration_sec", 10)
            if evt_sec <= sec <= evt_sec + a_dur:
                dt = sec - evt_sec
                spike = arousal["magnitude_bpm"] * math.exp(-dt / 5)
                hr += spike

        hr = max(40, min(120, round(hr)))
        ts = datetime.fromtimestamp(epoch, tz=timezone.utc)
        readings.append((ts, epoch, hr, "WHOOP 4.0"))

    return readings


# ── Main seed logic ───────────────────────────────────────────────
async def purge(conn: asyncpg.Connection):
    """Truncate all tables."""
    print("Purging all tables...")
    await conn.execute(
        "TRUNCATE settings, hr_readings, plm_series, events, "
        "motion_signals, videos, sessions CASCADE"
    )
    print("  Done.")


async def seed(conn: asyncpg.Connection):
    """Generate and insert 30 nights of sample data."""
    end_date = START_DATE + timedelta(days=NUM_NIGHTS - 1)
    print(f"Seeding {NUM_NIGHTS} nights ({START_DATE} to {end_date})...\n")

    total_sessions = 0
    total_videos = 0
    total_events = 0
    total_plms = 0
    total_hr = 0

    for night_idx in range(NUM_NIGHTS):
        night_date = START_DATE + timedelta(days=night_idx)
        session_id = make_session_id(night_idx)

        # Night parameters
        plmi_target = target_plmi(night_idx)
        bedtime_hour = 22
        bedtime_min = max(0, min(59, int(30 + random.gauss(0, 20))))
        recording_hours = max(6.0, min(8.0, random.gauss(7.0, 0.5)))
        hr_enabled = random.random() < 0.70

        # Timestamps
        started_at = datetime(
            night_date.year,
            night_date.month,
            night_date.day,
            bedtime_hour,
            bedtime_min,
            0,
            tzinfo=TZ,
        )
        stopped_at = started_at + timedelta(hours=recording_hours)
        total_hours = round(recording_hours, 2)

        # Insert session
        await conn.execute(
            """
            INSERT INTO sessions (id, status, started_at, stopped_at, night_date,
                                  total_hours, hr_enabled)
            VALUES ($1, 'analyzed', $2, $3, $4, $5, $6)
            """,
            session_id,
            started_at,
            stopped_at,
            night_date,
            total_hours,
            hr_enabled,
        )

        # Generate video chunks
        num_full_videos = int(recording_hours)
        remainder_sec = (recording_hours - num_full_videos) * 3600
        num_videos = num_full_videos + (1 if remainder_sec > 60 else 0)

        # Plan PLM distribution across videos (circadian weighting)
        target_plm_count = max(4, int(plmi_target * recording_hours))
        video_weights = []
        for v_idx in range(num_videos):
            progress = v_idx / num_videos
            weight = 1.5 - progress * 1.0  # More events early
            video_weights.append(weight)
        weight_sum = sum(video_weights)
        video_plm_counts = [
            max(0, round(target_plm_count * w / weight_sum)) for w in video_weights
        ]
        # Adjust to hit target
        diff = target_plm_count - sum(video_plm_counts)
        if diff > 0:
            video_plm_counts[0] += diff
        elif diff < 0:
            video_plm_counts[-1] = max(0, video_plm_counts[-1] + diff)

        night_events_count = 0
        night_plm_count = 0
        night_hr_count = 0
        series_id_offset = 0
        all_night_events = []  # For HR arousal correlation

        for v_idx in range(num_videos):
            video_start = started_at + timedelta(seconds=v_idx * 3600)
            duration_sec = 3600.0 if v_idx < num_full_videos else remainder_sec

            video_end = video_start + timedelta(seconds=duration_sec)
            start_fmt = video_start.strftime("%Y%m%dT%H%M%S")
            end_fmt = video_end.strftime("%Y%m%dT%H%M%S")
            filename = f"sleep_{start_fmt}_{end_fmt}.mp4"
            video_id = make_video_id(filename)
            frame_count = int(duration_sec * FPS)

            # Insert video
            await conn.execute(
                """
                INSERT INTO videos (id, filename, start_utc, end_utc, start_local,
                    end_local, duration_sec, fps, frame_count, width, height,
                    processed, session_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
                """,
                video_id,
                filename,
                video_start.astimezone(timezone.utc),
                video_end.astimezone(timezone.utc),
                video_start,
                video_end,
                duration_sec,
                FPS,
                frame_count,
                WIDTH,
                HEIGHT,
                session_id,
            )

            # Generate events for this video
            plm_target = video_plm_counts[v_idx]

            # PLM series events
            plm_events, series_info = generate_plm_series(
                0,
                duration_sec,
                plm_target,
                series_id_offset,
            )

            # Body movements (~25% of non-PLM events)
            non_plm_total = max(0, int(plm_target * 0.4))
            body_count = max(1, int(non_plm_total * 0.5))
            noise_count = max(1, non_plm_total - body_count)

            body_events = generate_body_movements(duration_sec, body_count)
            noise_events = generate_noise_limb_events(duration_sec, noise_count)

            # Combine and sort all events
            all_events = plm_events + body_events + noise_events
            all_events.sort(key=lambda e: e["timestamp_sec"])

            # Assign event_index and build debug
            prev_onset = None
            for i, evt in enumerate(all_events):
                evt["event_index"] = i + 1
                evt["peak_index"] = int(evt["timestamp_sec"] * FPS)
                evt["debug"] = make_debug(
                    evt, prev_onset if evt["movement_type"] == "limb" else None
                )
                prev_onset = (
                    evt["onset_sec"] if evt["movement_type"] == "limb" else prev_onset
                )

                # Track absolute second for HR correlation
                evt["_absolute_sec"] = v_idx * 3600 + evt["timestamp_sec"]

            # Arousal for PLM events on HR-enabled nights
            if hr_enabled:
                session_start_epoch = started_at.timestamp()
                for evt in all_events:
                    if evt["is_plm"]:
                        abs_sec = evt["_absolute_sec"]
                        # Estimate baseline HR at this time
                        progress = abs_sec / (recording_hours * 3600)
                        if progress < 0.1:
                            base_hr = 68 - progress * 100
                        elif progress < 0.85:
                            base_hr = 55 + math.sin(2 * math.pi * abs_sec / 5400) * 3
                        else:
                            base_hr = 55 + (progress - 0.85) * 80

                        has_arousal = random.random() < AROUSAL_RATE
                        evt["arousal"] = make_arousal(base_hr, has_arousal)
                    else:
                        evt["arousal"] = None
            else:
                for evt in all_events:
                    evt["arousal"] = None

            all_night_events.extend(all_events)

            # Insert events
            if all_events:
                await conn.executemany(
                    """
                    INSERT INTO events (video_id, event_index, timestamp_sec, onset_sec,
                        duration_sec, amplitude, spatial_variance, peak_index,
                        movement_type, is_plm, series_id, arousal, debug)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                    """,
                    [
                        (
                            video_id,
                            e["event_index"],
                            e["timestamp_sec"],
                            e["onset_sec"],
                            e["duration_sec"],
                            e["amplitude"],
                            e["spatial_variance"],
                            e["peak_index"],
                            e["movement_type"],
                            e["is_plm"],
                            e["series_id"],
                            json.dumps(e["arousal"]) if e["arousal"] else None,
                            json.dumps(e["debug"]) if e["debug"] else None,
                        )
                        for e in all_events
                    ],
                )

            # Insert PLM series
            if series_info:
                await conn.executemany(
                    """
                    INSERT INTO plm_series (video_id, series_index, event_count,
                        mean_interval_sec, start_sec, end_sec)
                    VALUES ($1,$2,$3,$4,$5,$6)
                    """,
                    [
                        (
                            video_id,
                            s["id"],
                            s["event_count"],
                            s["mean_interval_sec"],
                            s["start_sec"],
                            s["end_sec"],
                        )
                        for s in series_info
                    ],
                )

            # Insert motion signal
            signal_values = generate_motion_signal(duration_sec, all_events)
            await conn.execute(
                """
                INSERT INTO motion_signals (video_id, sample_rate_hz, values)
                VALUES ($1, $2, $3)
                """,
                video_id,
                1.0,
                signal_values,
            )

            series_id_offset += len(series_info)
            night_events_count += len(all_events)
            night_plm_count += sum(1 for e in all_events if e["is_plm"])

        # Insert HR readings for HR-enabled nights
        if hr_enabled:
            session_start_epoch = started_at.timestamp()
            arousal_plms = [
                e
                for e in all_night_events
                if e.get("arousal") and e["arousal"].get("has_arousal")
            ]
            hr_readings = generate_hr_readings(
                session_start_epoch,
                recording_hours * 3600,
                arousal_plms,
            )
            night_hr_count = len(hr_readings)

            # Batch insert HR readings using copy for performance
            await conn.copy_records_to_table(
                "hr_readings",
                records=hr_readings,
                columns=["ts", "epoch", "hr", "device"],
            )

        actual_plmi = round(night_plm_count / recording_hours, 1)
        hr_label = f"HR=yes  {night_hr_count:,} readings" if hr_enabled else "HR=no"
        print(
            f"  Night {night_idx + 1:2d}/{NUM_NIGHTS} ({night_date})  "
            f"PLMI={actual_plmi:5.1f}  {recording_hours:.1f}h  "
            f"{num_videos} videos  {night_events_count:3d} events  "
            f"{night_plm_count:3d} PLMs  {hr_label}"
        )

        total_sessions += 1
        total_videos += num_videos
        total_events += night_events_count
        total_plms += night_plm_count
        total_hr += night_hr_count

    print(
        f"\nDone. {total_sessions} sessions, {total_videos} videos, "
        f"{total_events:,} events, {total_plms:,} PLMs, "
        f"{total_hr:,} HR readings."
    )


async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(SCHEMA)
        await purge(conn)
        await seed(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
