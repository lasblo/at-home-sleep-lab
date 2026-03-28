"""PostgreSQL database module using asyncpg."""

import json
import os
import statistics
from datetime import datetime, date
from pathlib import Path

import asyncpg

_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'recording',
    started_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ,
    night_date DATE NOT NULL,
    total_hours DOUBLE PRECISION,
    hr_enabled BOOLEAN DEFAULT FALSE,
    unifi_camera_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    start_utc TIMESTAMPTZ NOT NULL,
    end_utc TIMESTAMPTZ NOT NULL,
    start_local TIMESTAMPTZ NOT NULL,
    end_local TIMESTAMPTZ NOT NULL,
    duration_sec DOUBLE PRECISION NOT NULL,
    fps DOUBLE PRECISION,
    frame_count INTEGER,
    width INTEGER,
    height INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    session_id TEXT REFERENCES sessions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS motion_signals (
    video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    sample_rate_hz DOUBLE PRECISION NOT NULL,
    values DOUBLE PRECISION[] NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    event_index INTEGER NOT NULL,
    timestamp_sec DOUBLE PRECISION NOT NULL,
    onset_sec DOUBLE PRECISION NOT NULL,
    duration_sec DOUBLE PRECISION NOT NULL,
    amplitude DOUBLE PRECISION NOT NULL,
    spatial_variance DOUBLE PRECISION,
    peak_index INTEGER,
    movement_type TEXT NOT NULL,
    is_plm BOOLEAN DEFAULT FALSE,
    series_id INTEGER,
    arousal JSONB,
    debug JSONB,
    UNIQUE(video_id, event_index)
);

CREATE TABLE IF NOT EXISTS plm_series (
    id SERIAL PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    series_index INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    mean_interval_sec DOUBLE PRECISION,
    start_sec DOUBLE PRECISION NOT NULL,
    end_sec DOUBLE PRECISION NOT NULL,
    UNIQUE(video_id, series_index)
);

CREATE TABLE IF NOT EXISTS hr_readings (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL,
    epoch DOUBLE PRECISION NOT NULL,
    hr INTEGER NOT NULL,
    device TEXT,
    UNIQUE(epoch)
);

CREATE INDEX IF NOT EXISTS idx_events_video ON events(video_id);
CREATE INDEX IF NOT EXISTS idx_events_plm ON events(video_id) WHERE is_plm;
CREATE INDEX IF NOT EXISTS idx_series_video ON plm_series(video_id);
CREATE INDEX IF NOT EXISTS idx_hr_epoch ON hr_readings(epoch);
CREATE INDEX IF NOT EXISTS idx_hr_ts ON hr_readings(ts);
"""


async def init_db():
    global _pool
    dsn = os.environ.get(
        "DATABASE_URL", "postgresql://sleeplab:sleeplab@localhost:5432/sleeplab"
    )
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _pool


async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ── Row helpers ────────────────────────────────────────────────────


def _video_row_to_dict(r, include_utc: bool = True) -> dict:
    d = {
        "id": r["id"],
        "filename": r["filename"],
        "start_local": r["start_local"].isoformat(),
        "end_local": r["end_local"].isoformat(),
        "duration_sec": r["duration_sec"],
        "processed": r["processed"],
    }
    if include_utc and "start_utc" in r.keys():
        d["start"] = r["start_utc"].isoformat()
        d["end"] = r["end_utc"].isoformat()
    return d


def _event_row_to_dict(e, include_video_id: bool = False) -> dict:
    ev = {
        "id": e["event_index"],
        "timestamp_sec": e["timestamp_sec"],
        "onset_sec": e["onset_sec"],
        "duration_sec": e["duration_sec"],
        "amplitude": e["amplitude"],
        "spatial_variance": e["spatial_variance"],
        "peak_index": e["peak_index"],
        "movement_type": e["movement_type"],
        "is_plm": e["is_plm"],
        "series_id": e["series_id"],
    }
    if include_video_id:
        ev["video_id"] = e["video_id"]
    if e["arousal"]:
        ev["arousal"] = json.loads(e["arousal"])
    if e["debug"]:
        ev["debug"] = json.loads(e["debug"])
    return ev


def _compute_summary(events: list[dict], recording_hours: float) -> dict:
    plm_count = sum(1 for e in events if e.get("is_plm"))
    return {
        "total_movements": len(events),
        "plm_count": plm_count,
        "plmi": round(plm_count / recording_hours, 1) if recording_hours > 0 else 0,
        "series_count": len(
            set(e.get("series_id") for e in events if e.get("series_id"))
        ),
        "recording_hours": round(recording_hours, 2),
        "body_movements": sum(1 for e in events if e.get("movement_type") == "body"),
    }


# ── Videos ──────────────────────────────────────────────────────────


async def list_videos() -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT id, filename, start_utc, end_utc, start_local, end_local,
               duration_sec, processed
        FROM videos ORDER BY start_local
    """)
    return [_video_row_to_dict(r) for r in rows]


async def save_video_results(
    video_meta: dict,
    video_info: dict,
    motion_signal: dict,
    events: list[dict],
    series: list[dict],
    summary: dict,
):
    pool = await get_pool()
    vid = video_meta["id"]
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE videos SET
                    fps = $2, frame_count = $3, width = $4, height = $5, processed = TRUE
                WHERE id = $1
            """,
                vid,
                video_info.get("fps"),
                video_info.get("frame_count"),
                video_info.get("width"),
                video_info.get("height"),
            )

            await conn.execute(
                """
                INSERT INTO motion_signals (video_id, sample_rate_hz, values)
                VALUES ($1, $2, $3)
                ON CONFLICT (video_id) DO UPDATE SET
                    sample_rate_hz = EXCLUDED.sample_rate_hz,
                    values = EXCLUDED.values
            """,
                vid,
                motion_signal["sample_rate_hz"],
                motion_signal["values"],
            )

            await conn.execute("DELETE FROM events WHERE video_id = $1", vid)
            await conn.execute("DELETE FROM plm_series WHERE video_id = $1", vid)

            if events:
                await conn.executemany(
                    """
                    INSERT INTO events (video_id, event_index, timestamp_sec, onset_sec,
                        duration_sec, amplitude, spatial_variance, peak_index,
                        movement_type, is_plm, series_id, arousal, debug)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                """,
                    [
                        (
                            vid,
                            e.get("id", 0),
                            e["timestamp_sec"],
                            e["onset_sec"],
                            e["duration_sec"],
                            e["amplitude"],
                            e.get("spatial_variance"),
                            e.get("peak_index"),
                            e.get("movement_type", "limb"),
                            e.get("is_plm", False),
                            e.get("series_id"),
                            json.dumps(e.get("arousal")) if e.get("arousal") else None,
                            json.dumps(e.get("debug")) if e.get("debug") else None,
                        )
                        for e in events
                    ],
                )

            if series:
                await conn.executemany(
                    """
                    INSERT INTO plm_series (video_id, series_index, event_count,
                        mean_interval_sec, start_sec, end_sec)
                    VALUES ($1,$2,$3,$4,$5,$6)
                """,
                    [
                        (
                            vid,
                            s["id"],
                            s["event_count"],
                            s.get("mean_interval_sec"),
                            s["start_sec"],
                            s["end_sec"],
                        )
                        for s in series
                    ],
                )


async def get_video_results(video_id: str) -> dict | None:
    pool = await get_pool()

    video = await pool.fetchrow("SELECT * FROM videos WHERE id = $1", video_id)
    if not video or not video["processed"]:
        return None

    motion = await pool.fetchrow(
        "SELECT * FROM motion_signals WHERE video_id = $1", video_id
    )
    events = await pool.fetch(
        "SELECT * FROM events WHERE video_id = $1 ORDER BY timestamp_sec", video_id
    )
    series = await pool.fetch(
        "SELECT * FROM plm_series WHERE video_id = $1 ORDER BY series_index", video_id
    )

    event_list = [_event_row_to_dict(e) for e in events]
    recording_hours = video["duration_sec"] / 3600

    return {
        "video": {
            "id": video["id"],
            "filename": video["filename"],
            "start": video["start_utc"].isoformat(),
            "end": video["end_utc"].isoformat(),
            "start_local": video["start_local"].isoformat(),
            "end_local": video["end_local"].isoformat(),
            "duration_sec": video["duration_sec"],
        },
        "video_info": {
            "fps": video["fps"],
            "frame_count": video["frame_count"],
            "width": video["width"],
            "height": video["height"],
            "duration_sec": video["duration_sec"],
        },
        "motion_signal": {
            "sample_rate_hz": motion["sample_rate_hz"],
            "values": list(motion["values"]),
        }
        if motion
        else {"sample_rate_hz": 0, "values": []},
        "events": event_list,
        "series": [
            {
                "id": s["series_index"],
                "event_count": s["event_count"],
                "mean_interval_sec": s["mean_interval_sec"],
                "start_sec": s["start_sec"],
                "end_sec": s["end_sec"],
            }
            for s in series
        ],
        "summary": _compute_summary(event_list, recording_hours),
    }


async def get_events_for_videos(video_ids: list[str]) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT * FROM events WHERE video_id = ANY($1) ORDER BY video_id, timestamp_sec
    """,
        video_ids,
    )
    return [_event_row_to_dict(e, include_video_id=True) for e in rows]


# ── HR Readings ─────────────────────────────────────────────────────


async def ingest_hr_readings(hr_dir: Path) -> int:
    if not hr_dir.exists():
        return 0

    readings = []
    for f in sorted(hr_dir.glob("*.jsonl")):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    readings.append((r["ts"], r["epoch"], r["hr"], r.get("device")))
                except (json.JSONDecodeError, KeyError):
                    continue

    if not readings:
        return 0

    pool = await get_pool()
    async with pool.acquire() as conn:
        for batch_start in range(0, len(readings), 1000):
            batch = readings[batch_start : batch_start + 1000]
            await conn.executemany(
                """
                INSERT INTO hr_readings (ts, epoch, hr, device)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (epoch) DO NOTHING
            """,
                batch,
            )

    return len(readings)


async def get_hr_range(start_epoch: float, end_epoch: float) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT epoch, hr FROM hr_readings
        WHERE epoch >= $1 AND epoch <= $2
        ORDER BY epoch
    """,
        start_epoch,
        end_epoch,
    )
    return [{"epoch": r["epoch"], "hr": r["hr"]} for r in rows]


async def get_hr_latest(since_epoch: float = 0, limit: int = 500) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT epoch, hr FROM hr_readings
        WHERE epoch >= $1
        ORDER BY epoch DESC
        LIMIT $2
    """,
        since_epoch,
        limit,
    )
    return [{"epoch": r["epoch"], "hr": r["hr"]} for r in rows]


# ── Settings ────────────────────────────────────────────────────────


async def get_setting(key: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchval("SELECT value FROM settings WHERE key = $1", key)
    return json.loads(row) if row else None


async def set_setting(key: str, value: dict):
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    """,
        key,
        json.dumps(value),
    )


# ── Sessions ────────────────────────────────────────────────────────


async def create_session(
    session_id: str,
    night_date: str,
    started_at: str,
    hr_enabled: bool,
    camera_id: str | None,
) -> dict:
    pool = await get_pool()
    started_dt = datetime.fromisoformat(started_at)
    night_dt = (
        date.fromisoformat(night_date) if isinstance(night_date, str) else night_date
    )
    await pool.execute(
        """
        INSERT INTO sessions (id, status, started_at, night_date, hr_enabled, unifi_camera_id)
        VALUES ($1, 'recording', $2, $3, $4, $5)
    """,
        session_id,
        started_dt,
        night_dt,
        hr_enabled,
        camera_id,
    )
    return await get_session(session_id)


async def get_session(session_id: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM sessions WHERE id = $1", session_id)
    return _session_to_dict(row) if row else None


async def get_active_session() -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM sessions WHERE status = 'recording' ORDER BY started_at DESC LIMIT 1"
    )
    return _session_to_dict(row) if row else None


async def list_sessions() -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM sessions ORDER BY started_at DESC")
    return [_session_to_dict(r) for r in rows]


async def update_session(session_id: str, **kwargs):
    pool = await get_pool()

    ts_cols = {"started_at", "stopped_at", "created_at"}
    date_cols = {"night_date"}

    sets = []
    vals = [session_id]
    i = 2
    for k, v in kwargs.items():
        if isinstance(v, str) and k in ts_cols:
            v = datetime.fromisoformat(v)
        elif isinstance(v, str) and k in date_cols:
            v = date.fromisoformat(v)
        sets.append(f"{k} = ${i}")
        vals.append(v)
        i += 1
    if not sets:
        return
    sql = f"UPDATE sessions SET {', '.join(sets)} WHERE id = $1"
    await pool.execute(sql, *vals)


async def get_session_detail(session_id: str) -> dict | None:
    session = await get_session(session_id)
    if not session:
        return None

    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, filename, start_utc, end_utc, start_local, end_local,
               duration_sec, processed
        FROM videos WHERE session_id = $1 ORDER BY start_local
    """,
        session_id,
    )
    videos = [_video_row_to_dict(r) for r in rows]

    processed_ids = [v["id"] for v in videos if v["processed"]]
    events = await get_events_for_videos(processed_ids) if processed_ids else []

    hours = session.get("total_hours") or sum(v["duration_sec"] for v in videos) / 3600

    session["videos"] = videos
    session["events"] = events
    session["summary"] = _compute_summary(events, hours)
    return session


def _session_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "status": row["status"],
        "started_at": row["started_at"].isoformat() if row["started_at"] else None,
        "stopped_at": row["stopped_at"].isoformat() if row["stopped_at"] else None,
        "night_date": row["night_date"].isoformat() if row["night_date"] else None,
        "total_hours": row["total_hours"],
        "hr_enabled": row["hr_enabled"],
        "unifi_camera_id": row["unifi_camera_id"],
        "notes": row["notes"],
    }


# ── Dashboard ───────────────────────────────────────────────────────


async def get_dashboard_summary() -> dict:
    """Aggregate stats across all analyzed sessions using SQL — no event loading."""
    pool = await get_pool()

    # Per-session aggregates
    rows = await pool.fetch("""
        SELECT
            s.id as session_id,
            s.night_date,
            s.total_hours,
            s.hr_enabled,
            s.started_at,
            COUNT(e.*) FILTER (WHERE e.is_plm) as plm_count,
            COUNT(e.*) FILTER (WHERE e.movement_type = 'body') as body_count,
            COUNT(e.*) as total_movements,
            COUNT(DISTINCT e.series_id) FILTER (WHERE e.series_id IS NOT NULL) as series_count
        FROM sessions s
        JOIN videos v ON v.session_id = s.id AND v.processed = true
        JOIN events e ON e.video_id = v.id
        WHERE s.status = 'analyzed'
        GROUP BY s.id
        ORDER BY s.night_date
    """)

    sessions = []
    for r in rows:
        hours = r["total_hours"] or 0
        plm_count = r["plm_count"]
        plmi = round(plm_count / hours, 1) if hours > 0 else 0
        sessions.append(
            {
                "session_id": r["session_id"],
                "night_date": r["night_date"].isoformat(),
                "total_hours": round(hours, 2),
                "plmi": plmi,
                "plm_count": plm_count,
                "series_count": r["series_count"],
                "body_movements": r["body_count"],
                "recording_hours": round(hours, 2),
                "hr_enabled": r["hr_enabled"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "arousal_pct": None,
                "plmai": None,
            }
        )

    # Arousal stats for HR-enabled sessions
    session_ids_with_hr = [s["session_id"] for s in sessions if s["hr_enabled"]]
    if session_ids_with_hr:
        arousal_rows = await pool.fetch(
            """
            SELECT
                v.session_id,
                COUNT(e.*) FILTER (WHERE e.is_plm) as plm_count,
                COUNT(e.*) FILTER (
                    WHERE e.is_plm AND e.arousal IS NOT NULL
                    AND (e.arousal::jsonb->>'has_arousal')::boolean = true
                ) as arousal_count
            FROM events e
            JOIN videos v ON e.video_id = v.id AND v.processed = true
            WHERE v.session_id = ANY($1)
            GROUP BY v.session_id
        """,
            session_ids_with_hr,
        )

        arousal_map = {}
        for ar in arousal_rows:
            plm = ar["plm_count"]
            ac = ar["arousal_count"]
            arousal_map[ar["session_id"]] = {
                "arousal_pct": round(ac / plm * 100, 1) if plm > 0 else 0,
                "arousal_count": ac,
                "plm_count": plm,
            }

        for s in sessions:
            if s["session_id"] in arousal_map:
                am = arousal_map[s["session_id"]]
                s["arousal_pct"] = am["arousal_pct"]
                hours = s["total_hours"] or 0
                s["plmai"] = round(am["arousal_count"] / hours, 1) if hours > 0 else 0

    # Aggregate hourly distribution
    # timestamp_sec is per-video (0-3600 for 1h videos), so add video offset from session start
    hourly_rows = await pool.fetch("""
        SELECT
            floor((extract(epoch from v.start_local - s.started_at) + e.timestamp_sec) / 3600)::int as hour_offset,
            COUNT(e.*) FILTER (WHERE e.is_plm) as plm_count,
            COUNT(e.*) FILTER (WHERE e.movement_type = 'body') as body_count,
            COUNT(DISTINCT v.session_id) as night_count
        FROM events e
        JOIN videos v ON e.video_id = v.id AND v.processed = true
        JOIN sessions s ON v.session_id = s.id AND s.status = 'analyzed'
        GROUP BY hour_offset
        ORDER BY hour_offset
    """)

    total_nights = len(sessions) or 1
    aggregate_hourly = []
    for hr in hourly_rows:
        h = hr["hour_offset"]
        aggregate_hourly.append(
            {
                "hour": h,
                "label": f"Hour {h + 1}",
                "avg_plm": round(hr["plm_count"] / total_nights, 1),
                "avg_body": round(hr["body_count"] / total_nights, 1),
                "night_count": hr["night_count"],
            }
        )

    # ── Nightly HR stats for HR-enabled sessions ──
    if session_ids_with_hr:
        hr_stats = await _compute_session_hr_stats(pool, sessions)
        for s in sessions:
            if s["session_id"] in hr_stats:
                s["hr_stats"] = hr_stats[s["session_id"]]

    # ── Sleep quality metrics from motion events ──
    sleep_quality = await _compute_sleep_quality(pool, sessions)
    for s in sessions:
        if s["session_id"] in sleep_quality:
            s["sleep_quality"] = sleep_quality[s["session_id"]]

    return {"sessions": sessions, "aggregate_hourly": aggregate_hourly}


async def insert_video(
    video_id: str,
    filename: str,
    start_utc: str,
    end_utc: str,
    start_local: str,
    end_local: str,
    duration_sec: float,
    session_id: str | None = None,
):
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO videos (id, filename, start_utc, end_utc, start_local, end_local,
                           duration_sec, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET session_id = COALESCE(EXCLUDED.session_id, videos.session_id)
    """,
        video_id,
        filename,
        start_utc,
        end_utc,
        start_local,
        end_local,
        duration_sec,
        session_id,
    )


# ── Nightly HR Stats ──────────────────────────────────────────────


def _sleeping_hr(hr_values: list[int], window_size: int = 300) -> int | None:
    """Lowest 5-minute rolling median — robust sleeping HR estimate."""
    if len(hr_values) < window_size:
        return min(hr_values) if hr_values else None

    best = float("inf")
    for i in range(len(hr_values) - window_size + 1):
        med = statistics.median(hr_values[i : i + window_size])
        if med < best:
            best = med
    return round(best)


async def _compute_session_hr_stats(
    pool: asyncpg.Pool, sessions: list[dict]
) -> dict[str, dict]:
    """Compute nightly HR stats for sessions that have HR data."""
    hr_sessions = [s for s in sessions if s["hr_enabled"] and s["started_at"]]
    if not hr_sessions:
        return {}

    result = {}
    for s in hr_sessions:
        started = datetime.fromisoformat(s["started_at"])
        hours = s["total_hours"] or 0
        if hours <= 0:
            continue
        end_epoch = started.timestamp() + hours * 3600

        rows = await pool.fetch(
            """
            SELECT hr FROM hr_readings
            WHERE epoch >= $1 AND epoch <= $2
            ORDER BY epoch
        """,
            started.timestamp(),
            end_epoch,
        )
        if not rows:
            continue

        hr_values = [r["hr"] for r in rows]
        avg_hr = round(statistics.mean(hr_values))
        min_hr = min(hr_values)
        max_hr = max(hr_values)
        sleep_hr = _sleeping_hr(hr_values)

        # Nocturnal dip: compare first 30 min (pre-sleep/settling) to sleeping HR
        first_30min = hr_values[: min(1800, len(hr_values) // 4)]
        if first_30min and sleep_hr:
            waking_hr = round(statistics.median(first_30min))
            dip_pct = (
                round((1 - sleep_hr / waking_hr) * 100, 1) if waking_hr > 0 else None
            )
        else:
            waking_hr = None
            dip_pct = None

        result[s["session_id"]] = {
            "avg_hr": avg_hr,
            "min_hr": min_hr,
            "max_hr": max_hr,
            "sleeping_hr": sleep_hr,
            "waking_hr": waking_hr,
            "dip_pct": dip_pct,
            "reading_count": len(hr_values),
        }

    return result


# ── Sleep Quality from Motion ─────────────────────────────────────


async def _compute_sleep_quality(
    pool: asyncpg.Pool, sessions: list[dict]
) -> dict[str, dict]:
    """Estimate sleep efficiency, onset latency, and WASO from motion events."""
    session_ids = [s["session_id"] for s in sessions]
    if not session_ids:
        return {}

    # Get all events with their absolute night-second offset
    rows = await pool.fetch(
        """
        SELECT
            v.session_id,
            extract(epoch from v.start_local - s.started_at) + e.timestamp_sec as night_sec,
            e.movement_type,
            e.duration_sec,
            e.amplitude
        FROM events e
        JOIN videos v ON e.video_id = v.id AND v.processed = true
        JOIN sessions s ON v.session_id = s.id
        WHERE v.session_id = ANY($1)
        ORDER BY v.session_id, night_sec
    """,
        session_ids,
    )

    # Group events by session
    events_by_session: dict[str, list[dict]] = {}
    for r in rows:
        sid = r["session_id"]
        events_by_session.setdefault(sid, []).append(
            {
                "night_sec": r["night_sec"],
                "movement_type": r["movement_type"],
                "duration_sec": r["duration_sec"],
                "amplitude": r["amplitude"],
            }
        )

    result = {}
    for s in sessions:
        sid = s["session_id"]
        hours = s["total_hours"] or 0
        if hours <= 0:
            continue
        total_sec = hours * 3600
        events = events_by_session.get(sid, [])

        # Sleep onset latency: first 10-min gap with no significant motion
        onset_sec = _estimate_sleep_onset(events, total_sec)

        # WASO: sum of wake periods after sleep onset (motion clusters > 2 min)
        waso_sec = _estimate_waso(events, onset_sec, total_sec)

        # Sleep efficiency
        sleep_time = total_sec - onset_sec - waso_sec
        efficiency = (
            round(max(0, sleep_time / total_sec) * 100, 1) if total_sec > 0 else None
        )

        # Fragmentation: number of wake bouts after onset
        wake_bouts = _count_wake_bouts(events, onset_sec, total_sec)

        result[sid] = {
            "sleep_onset_min": round(onset_sec / 60, 1),
            "waso_min": round(waso_sec / 60, 1),
            "efficiency_pct": efficiency,
            "wake_bouts": wake_bouts,
        }

    return result


def _estimate_sleep_onset(events: list[dict], total_sec: float) -> float:
    """Find first 10-minute quiet window — that's estimated sleep onset."""
    quiet_threshold = 600  # 10 minutes
    if not events:
        return 0

    # Check gap before first event
    if events[0]["night_sec"] >= quiet_threshold:
        return 0

    # Check gaps between events
    for i in range(len(events) - 1):
        gap = events[i + 1]["night_sec"] - events[i]["night_sec"]
        if gap >= quiet_threshold:
            return events[i]["night_sec"]

    # No long quiet period found — assume fell asleep after 15 min
    return min(900, total_sec * 0.05)


def _estimate_waso(events: list[dict], onset_sec: float, total_sec: float) -> float:
    """Estimate wake-after-sleep-onset from motion clusters."""
    # A "wake bout" is a cluster of events within 2 minutes of each other
    # with at least one body movement or high-amplitude event
    post_onset = [e for e in events if e["night_sec"] > onset_sec]
    if not post_onset:
        return 0

    waso = 0.0
    cluster_start = None
    cluster_end = None

    for e in post_onset:
        t = e["night_sec"]
        is_significant = e["movement_type"] == "body" or e["amplitude"] > 0.5

        if cluster_start is None:
            if is_significant:
                cluster_start = t
                cluster_end = t + e["duration_sec"]
        else:
            if t - cluster_end < 120:  # within 2 min of cluster
                cluster_end = t + e["duration_sec"]
            else:
                # Close cluster — count as wake if > 2 min
                duration = cluster_end - cluster_start
                if duration > 120:
                    waso += duration
                if is_significant:
                    cluster_start = t
                    cluster_end = t + e["duration_sec"]
                else:
                    cluster_start = None
                    cluster_end = None

    # Close final cluster
    if cluster_start is not None:
        duration = cluster_end - cluster_start
        if duration > 120:
            waso += duration

    return waso


def _count_wake_bouts(events: list[dict], onset_sec: float, total_sec: float) -> int:
    """Count distinct wake episodes after sleep onset."""
    post_onset = [
        e
        for e in events
        if e["night_sec"] > onset_sec
        and (e["movement_type"] == "body" or e["amplitude"] > 0.5)
    ]
    if not post_onset:
        return 0

    bouts = 1
    for i in range(1, len(post_onset)):
        if post_onset[i]["night_sec"] - post_onset[i - 1]["night_sec"] > 300:
            bouts += 1
    return bouts
