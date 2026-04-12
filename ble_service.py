"""BLE Host Microservice — Bluetooth proxy for BLE heart rate monitoring.

Runs on the host (not Docker) to access Bluetooth hardware.
The backend calls this service over HTTP to discover devices,
test connections, and start/stop HR streaming.

Usage: make ble  (or: .venv/bin/python ble_service.py)
"""

import asyncio
import json
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakScanner, BleakClient
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="BLE Service")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
HR_CHAR = "00002a37-0000-1000-8000-00805f9b34fb"

HR_INPUT_DIR = Path(__file__).parent / "hr_input"
HR_INPUT_DIR.mkdir(parents=True, exist_ok=True)
HR_STATUS_FILE = HR_INPUT_DIR / "hr_status.json"

# Streaming state
_stream_task: asyncio.Task | None = None
_stream_device: str | None = None
_readings_count: int = 0


def _parse_hr(data: bytearray) -> tuple[int, list[float]]:
    """Parse HR Measurement characteristic (0x2A37).

    Returns (hr_bpm, rr_intervals_ms).
    RR intervals are converted from 1/1024s units to milliseconds.
    """
    flags = data[0]
    offset = 1

    # HR value: UINT16 if bit 0 set, else UINT8
    if flags & 0x01:
        hr = int.from_bytes(data[offset : offset + 2], "little")
        offset += 2
    else:
        hr = data[offset]
        offset += 1

    # Skip Energy Expended (2 bytes) if bit 3 set
    if flags & 0x08:
        offset += 2

    # RR intervals if bit 4 set — each is UINT16 LE in 1/1024 sec units
    rr_intervals: list[float] = []
    if flags & 0x10:
        while offset + 1 < len(data):
            rr_raw = int.from_bytes(data[offset : offset + 2], "little")
            rr_ms = round(rr_raw / 1.024, 1)  # convert to ms
            rr_intervals.append(rr_ms)
            offset += 2

    return hr, rr_intervals


def _write_status(status: str, device: str | None = None, hr: int | None = None):
    HR_STATUS_FILE.write_text(
        json.dumps(
            {
                "status": status,
                "device": device,
                "hr": hr,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    )


def _hr_file() -> Path:
    return HR_INPUT_DIR / f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"


# ── Discovery ───────────────────────────────────────────────────────


@app.get("/discover")
async def discover():
    """Scan for BLE devices with Heart Rate service. Returns list of devices."""
    try:
        devices = await BleakScanner.discover(timeout=8, return_adv=True)
    except Exception as e:
        return {"ok": False, "error": str(e), "devices": []}

    hr_devices = []
    for d, adv in devices.values():
        has_hr = HR_SERVICE in (adv.service_uuids or [])
        if has_hr:
            hr_devices.append(
                {
                    "address": d.address,
                    "name": d.name or "Unknown",
                }
            )

    return {"ok": True, "devices": hr_devices}


# ── Test Connection ─────────────────────────────────────────────────


@app.post("/test")
async def test(request_body: dict | None = None):
    """Connect to a device briefly and read one HR value to verify it works."""
    import starlette.requests

    # Parse body
    if request_body is None:
        return {"ok": False, "error": "No request body"}
    address = request_body.get("address")
    if not address:
        return {"ok": False, "error": "Missing 'address' field"}

    try:
        async with BleakClient(address, timeout=10) as client:
            if not client.is_connected:
                return {"ok": False, "error": "Failed to connect"}

            hr_value = None
            event = asyncio.Event()

            def callback(_, data):
                nonlocal hr_value
                hr_value, _ = _parse_hr(data)
                event.set()

            await client.start_notify(HR_CHAR, callback)
            try:
                await asyncio.wait_for(event.wait(), timeout=10)
            except asyncio.TimeoutError:
                return {
                    "ok": False,
                    "error": "Connected but no HR data received within 10s",
                }
            finally:
                await client.stop_notify(HR_CHAR)

            return {"ok": True, "hr": hr_value, "address": address}

    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Start/Stop Streaming ───────────────────────────────────────────


@app.post("/start")
async def start(request_body: dict | None = None):
    """Start continuous HR streaming from a specific device."""
    global _stream_task, _stream_device

    if _stream_task and not _stream_task.done():
        return {"status": "already_running", "device": _stream_device}

    if not request_body:
        return {"status": "error", "error": "No request body"}
    address = request_body.get("address")
    if not address:
        return {"status": "error", "error": "Missing 'address' field"}

    _stream_device = address
    _stream_task = asyncio.create_task(_stream_hr(address))
    return {"status": "started", "device": address}


@app.post("/stop")
async def stop():
    """Stop HR streaming."""
    global _stream_task, _stream_device
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
        try:
            await _stream_task
        except asyncio.CancelledError:
            pass
    _stream_task = None
    _stream_device = None
    _write_status("stopped")
    return {"status": "stopped"}


@app.get("/status")
async def status():
    """Current streaming status."""
    running = _stream_task is not None and not _stream_task.done()
    if HR_STATUS_FILE.exists():
        try:
            data = json.loads(HR_STATUS_FILE.read_text())
            data["running"] = running
            return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"status": "stopped", "running": running}


# ── Streaming Loop ──────────────────────────────────────────────────


async def _stream_hr(address: str):
    """Connect to device and stream HR data to JSONL files."""
    global _readings_count
    _readings_count = 0

    _write_status("connecting", device=address)
    print(f"Connecting to {address}...")

    try:
        async with BleakClient(address, timeout=15) as client:
            if not client.is_connected:
                _write_status("failed", device=address)
                return

            device_name = address
            # Try to get friendly name
            try:
                for service in client.services:
                    pass
                device_name = client.services.characteristics.get(
                    "00002a00-0000-1000-8000-00805f9b34fb", address
                )
            except Exception:
                pass

            print(f"Connected to {address}. Streaming HR...")
            _write_status("connected", device=address)

            def callback(_, data):
                global _readings_count
                hr, rr_intervals = _parse_hr(data)
                _readings_count += 1
                now = datetime.now(timezone.utc)

                entry = {
                    "ts": now.isoformat(),
                    "epoch": now.timestamp(),
                    "hr": hr,
                    "device": address,
                }
                if rr_intervals:
                    entry["rr"] = rr_intervals
                with open(_hr_file(), "a") as f:
                    f.write(json.dumps(entry) + "\n")

                _write_status("streaming", device=address, hr=hr)
                rr_label = f"  RR: {rr_intervals}" if rr_intervals else ""
                print(
                    f"\r  HR: {hr} bpm  ({_readings_count} readings){rr_label}  ",
                    end="",
                    flush=True,
                )

            await client.start_notify(HR_CHAR, callback)

            try:
                while client.is_connected:
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                print(f"\nStopping stream ({_readings_count} readings)")
            finally:
                _write_status("disconnected", device=address)

    except asyncio.CancelledError:
        _write_status("stopped", device=address)
    except Exception as e:
        print(f"Stream error: {e}")
        _write_status("error", device=address)


# ── Main ────────────────────────────────────────────────────────────


def _shutdown(signum, frame):
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    print(f"BLE Service starting on :8001")
    print(f"HR data dir: {HR_INPUT_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
