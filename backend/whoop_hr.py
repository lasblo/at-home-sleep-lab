"""
WHOOP Heart Rate BLE listener.

Run this from Terminal.app (not from Claude Code) because macOS requires
Bluetooth permissions via the calling app's Info.plist.

Usage:
    cd /Users/lasse/workspace/sleep_analysis
    .venv/bin/python backend/whoop_hr.py

Writes live HR data to output/hr_live.jsonl (one JSON line per reading).
The FastAPI backend reads this file to serve HR data to the frontend.
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakScanner, BleakClient

HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
HR_CHAR = "00002a37-0000-1000-8000-00805f9b34fb"
DEVICE_NAME = "MG"  # WHOOP device name filter

OUTPUT_DIR = Path(__file__).parent.parent / "output"
HR_DIR = OUTPUT_DIR / "hr"
HR_STATUS_FILE = OUTPUT_DIR / "hr_status.json"


def hr_file_for_now() -> Path:
    """Return date-based HR file path, e.g. output/hr/2026-03-27.jsonl.
    Uses UTC date so a full night stays in one file even across local midnight."""
    return HR_DIR / f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"


def parse_hr(data: bytearray) -> int:
    """Parse HR value from BLE Heart Rate Measurement characteristic."""
    flags = data[0]
    if flags & 1:  # uint16 format
        return int.from_bytes(data[1:3], "little")
    return data[1]  # uint8 format


def write_status(status: str, device: str = None, hr: int = None):
    """Write current status for the backend to read."""
    HR_STATUS_FILE.write_text(json.dumps({
        "status": status,
        "device": device,
        "last_hr": hr,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))


async def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    HR_DIR.mkdir(exist_ok=True)

    print(f"Scanning for WHOOP device '{DEVICE_NAME}'...")
    write_status("scanning")

    # Scan for the specific device
    hr_device = None
    for attempt in range(3):
        devices = await BleakScanner.discover(timeout=5, return_adv=True)
        for d, adv in devices.values():
            has_hr = HR_SERVICE in (adv.service_uuids or [])
            if has_hr:
                print(f"  Found HR device: {d.name} ({d.address})")
                if d.name == DEVICE_NAME or DEVICE_NAME is None:
                    hr_device = d
                    break
        if hr_device:
            break
        print(f"  Attempt {attempt + 1}/3 — not found yet, rescanning...")

    if not hr_device:
        print(f"ERROR: Device '{DEVICE_NAME}' not found after 3 scans.")
        print("Make sure your WHOOP is nearby and broadcasting HR.")
        write_status("not_found")
        return

    print(f"Connecting to {hr_device.name} ({hr_device.address})...")
    write_status("connecting", device=hr_device.name)

    readings = 0

    async with BleakClient(hr_device) as client:
        print(f"Connected! Logging HR to {HR_DIR}/<date>.jsonl")
        print("Press Ctrl+C to stop.\n")
        write_status("connected", device=hr_device.name)

        def callback(_, data):
            nonlocal readings
            hr = parse_hr(data)
            now = datetime.now(timezone.utc)
            readings += 1

            # Append to JSONL file
            entry = {
                "ts": now.isoformat(),
                "epoch": now.timestamp(),
                "hr": hr,
                "device": hr_device.name,
            }
            with open(hr_file_for_now(), "a") as f:
                f.write(json.dumps(entry) + "\n")

            # Update status
            write_status("streaming", device=hr_device.name, hr=hr)

            # Print to terminal
            print(f"\r  HR: {hr} bpm  ({readings} readings)  ", end="", flush=True)

        await client.start_notify(HR_CHAR, callback)

        try:
            while client.is_connected:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\n\nStopping...")
        finally:
            write_status("disconnected", device=hr_device.name)
            print(f"Total readings: {readings}")
            print(f"Data saved to: {HR_DIR}/")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        write_status("stopped")
        print("\nStopped.")
