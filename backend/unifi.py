"""Async module for interacting with the UniFi Protect API on a UCG-Max.

Uses the `uiprotect` library (pip install uiprotect) to communicate with
UniFi Protect. All functions are standalone -- no global state or persistent
connections. The client is closed after every operation.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from uiprotect import ProtectApiClient

logger = logging.getLogger(__name__)

# Default HTTPS port for UniFi OS devices (UCG-Max, UDMP, etc.)
PROTECT_PORT = 443


async def _make_client(
    host: str,
    username: str,
    password: str,
    verify_ssl: bool,
) -> ProtectApiClient:
    """Create a ProtectApiClient and load bootstrap data."""
    client = ProtectApiClient(
        host=host,
        port=PROTECT_PORT,
        username=username,
        password=password,
        verify_ssl=verify_ssl,
    )
    await client.update()
    return client


async def test_connection(
    host: str,
    username: str,
    password: str,
    verify_ssl: bool = False,
) -> dict:
    """Test connection to UniFi Protect.

    Returns:
        {"ok": True, "name": "...", "version": "..."} on success, or
        {"ok": False, "error": "..."} on failure.
    """
    client: ProtectApiClient | None = None
    try:
        client = await _make_client(host, username, password, verify_ssl)
        nvr = client.bootstrap.nvr
        return {
            "ok": True,
            "name": nvr.name or nvr.host_shortname,
            "version": str(nvr.version),
        }
    except Exception as exc:
        logger.exception("Failed to connect to UniFi Protect at %s", host)
        return {"ok": False, "error": str(exc)}
    finally:
        if client is not None:
            await client.close_session()


async def list_cameras(
    host: str,
    username: str,
    password: str,
    verify_ssl: bool = False,
) -> list[dict]:
    """List all cameras registered with UniFi Protect.

    Returns:
        A list of dicts, each with keys: id, name, type, is_connected.
        On connection failure returns an empty list (error is logged).
    """
    client: ProtectApiClient | None = None
    try:
        client = await _make_client(host, username, password, verify_ssl)
        cameras = []
        for camera in client.bootstrap.cameras.values():
            cameras.append(
                {
                    "id": camera.id,
                    "name": camera.name,
                    "type": camera.type,
                    "is_connected": camera.is_connected,
                }
            )
        return cameras
    except Exception:
        logger.exception("Failed to list cameras from UniFi Protect at %s", host)
        return []
    finally:
        if client is not None:
            await client.close_session()


async def fetch_video(
    host: str,
    username: str,
    password: str,
    camera_id: str,
    start_time: datetime,
    end_time: datetime,
    output_path: Path,
    verify_ssl: bool = False,
) -> Path:
    """Download a video recording for a time range from a specific camera.

    Uses the Protect API's MP4 export endpoint.  The output file is written
    incrementally so large recordings don't need to fit in memory.

    Args:
        host: UniFi Protect hostname or IP.
        username: Local admin username.
        password: Local admin password.
        camera_id: The camera's unique ID (from list_cameras).
        start_time: Start of the desired clip (UTC recommended).
        end_time: End of the desired clip (UTC recommended).
        output_path: Where to write the .mp4 file.
        verify_ssl: Verify TLS cert (False for self-signed).

    Returns:
        The output_path on success.

    Raises:
        ConnectionError: If the API is unreachable or auth fails.
        ValueError: If the camera_id is unknown or no footage is available.
    """
    client: ProtectApiClient | None = None
    try:
        client = await _make_client(host, username, password, verify_ssl)

        if camera_id not in client.bootstrap.cameras:
            raise ValueError(
                f"Camera {camera_id!r} not found. "
                f"Available: {list(client.bootstrap.cameras.keys())}"
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(
            "Exporting video from camera %s (%s -> %s) to %s",
            camera_id,
            start_time.isoformat(),
            end_time.isoformat(),
            output_path,
        )

        await client.get_camera_video(
            camera_id=camera_id,
            start=start_time,
            end=end_time,
            output_file=output_path,
        )

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise ValueError(
                f"No video data returned for camera {camera_id!r} "
                f"in range {start_time.isoformat()} - {end_time.isoformat()}. "
                "The camera may not have recordings for this period."
            )

        logger.info(
            "Video export complete: %s (%.1f MB)",
            output_path,
            output_path.stat().st_size / (1024 * 1024),
        )
        return output_path

    except (ConnectionError, ValueError):
        raise
    except Exception as exc:
        raise ConnectionError(
            f"Failed to fetch video from UniFi Protect at {host}: {exc}"
        ) from exc
    finally:
        if client is not None:
            await client.close_session()
