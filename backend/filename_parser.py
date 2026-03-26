import re
from datetime import datetime, timezone, timedelta

GMT_PLUS_1 = timezone(timedelta(hours=1))

_PATTERN = re.compile(
    r"Full Body "
    r"(\d{1,2})-(\d{1,2})-(\d{4}), (\d{2})\.(\d{2})\.(\d{2}) GMT\+1"
    r" - "
    r"(\d{1,2})-(\d{1,2})-(\d{4}), (\d{2})\.(\d{2})\.(\d{2}) GMT\+1"
    r"\.mp4$"
)


def parse_filename(filename: str) -> dict:
    """Parse video filename into start/end datetimes.

    Input:  "Full Body 3-25-2026, 00.15.11 GMT+1 - 3-25-2026, 01.15.11 GMT+1.mp4"
    Output: {"start": datetime(UTC), "end": datetime(UTC), "start_local": datetime(GMT+1), ...}
    """
    m = _PATTERN.search(filename)
    if not m:
        raise ValueError(f"Cannot parse filename: {filename}")

    g = [int(x) for x in m.groups()]
    start_local = datetime(g[2], g[0], g[1], g[3], g[4], g[5], tzinfo=GMT_PLUS_1)
    end_local = datetime(g[8], g[6], g[7], g[9], g[10], g[11], tzinfo=GMT_PLUS_1)

    return {
        "start": start_local.astimezone(timezone.utc),
        "end": end_local.astimezone(timezone.utc),
        "start_local": start_local,
        "end_local": end_local,
        "duration_sec": (end_local - start_local).total_seconds(),
    }
