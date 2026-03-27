# AASM PLMS scoring criteria
MIN_MOVEMENT_DURATION = 0.4   # seconds (slightly relaxed from AASM 0.5s for video frame timing)
MAX_MOVEMENT_DURATION = 10.0  # seconds
MIN_INTERVAL = 4.5            # seconds (onset-to-onset, slight tolerance for video frame timing)
MAX_INTERVAL = 90.0           # seconds
MIN_SERIES_LENGTH = 4         # minimum events for a PLM series

# Body movement classification (position changes, not limb movements)
BODY_MOVEMENT_AMP_THRESHOLD = 25.0  # high amplitude
BODY_MOVEMENT_DUR_THRESHOLD = 3.0   # AND long duration → likely a position change


def _classify_event(event: dict) -> str:
    """Classify an event as 'limb' or 'body' movement.

    Body movements (rolling over, position changes) have high amplitude
    AND long duration. They should not be counted as periodic limb movements.
    """
    amp = event.get("amplitude", 0)
    dur = event.get("duration_sec", 0)
    if amp > BODY_MOVEMENT_AMP_THRESHOLD and dur > BODY_MOVEMENT_DUR_THRESHOLD:
        return "body"
    return "limb"


def apply_plms_criteria(events: list[dict], recording_hours: float) -> dict:
    """Filter events by AASM criteria and group into PLM series.

    Returns:
        events: list with is_plm, series_id, and movement_type added
        series: list of series info
        summary: aggregate metrics
    """
    # Classify and filter by duration
    candidates = []
    for e in events:
        e = dict(e)
        e["is_plm"] = False
        e["series_id"] = None
        e["movement_type"] = _classify_event(e)
        candidates.append(e)

    # Only limb movements with valid duration can be PLM candidates
    plm_candidates = [
        e for e in candidates
        if e["movement_type"] == "limb"
        and MIN_MOVEMENT_DURATION <= e["duration_sec"] <= MAX_MOVEMENT_DURATION
    ]
    plm_candidates.sort(key=lambda e: e["timestamp_sec"])

    # Build chains of consecutive events with valid inter-movement intervals
    chains = []
    current_chain = []

    for event in plm_candidates:
        if not current_chain:
            current_chain.append(event)
            continue

        interval = event["onset_sec"] - current_chain[-1]["onset_sec"]
        if MIN_INTERVAL <= interval <= MAX_INTERVAL:
            current_chain.append(event)
        else:
            if len(current_chain) >= MIN_SERIES_LENGTH:
                chains.append(current_chain)
            current_chain = [event]

    if len(current_chain) >= MIN_SERIES_LENGTH:
        chains.append(current_chain)

    # Tag events with series info
    series_list = []
    plm_count = 0
    for series_idx, chain in enumerate(chains, start=1):
        event_timestamps = []
        intervals = []
        for i, event in enumerate(chain):
            event["is_plm"] = True
            event["series_id"] = series_idx
            event_timestamps.append(event["timestamp_sec"])
            if i > 0:
                intervals.append(event["onset_sec"] - chain[i - 1]["onset_sec"])
            plm_count += 1

        series_list.append({
            "id": series_idx,
            "event_count": len(chain),
            "event_timestamps": event_timestamps,
            "mean_interval_sec": round(sum(intervals) / len(intervals), 1) if intervals else 0,
            "start_sec": chain[0]["timestamp_sec"],
            "end_sec": chain[-1]["timestamp_sec"],
        })

    # Rebuild full event list preserving order
    plm_map = {}
    for e in plm_candidates:
        if e["is_plm"]:
            plm_map[e["timestamp_sec"]] = e

    result_events = []
    for i, e in enumerate(candidates):
        e = dict(e)
        e["id"] = i + 1
        tagged = plm_map.get(e["timestamp_sec"])
        if tagged:
            e["is_plm"] = True
            e["series_id"] = tagged["series_id"]
        result_events.append(e)

    plmi = round(plm_count / recording_hours, 1) if recording_hours > 0 else 0

    body_movement_count = sum(1 for e in result_events if e["movement_type"] == "body")

    return {
        "events": result_events,
        "series": series_list,
        "summary": {
            "total_movements": len(events),
            "plm_count": plm_count,
            "plmi": plmi,
            "series_count": len(series_list),
            "recording_hours": round(recording_hours, 2),
            "body_movements": body_movement_count,
        },
    }
