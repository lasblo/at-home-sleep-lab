"""BLE Host Microservice for WHOOP Heart Rate Monitoring.

Runs on the host machine (not in Docker) to access Bluetooth hardware.
Controlled by the backend via HTTP at :8001.

Usage: make ble  (or: .venv/bin/python ble_service.py)
"""

import json
import signal
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="BLE Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HR_SCRIPT = Path(__file__).parent / "backend" / "whoop_hr.py"
HR_INPUT_DIR = Path(__file__).parent / "hr_input"
HR_STATUS_FILE = HR_INPUT_DIR / "hr_status.json"

_process: subprocess.Popen | None = None


@app.get("/status")
async def status():
    running = _process is not None and _process.poll() is None
    if HR_STATUS_FILE.exists():
        try:
            data = json.loads(HR_STATUS_FILE.read_text())
            data["managed"] = running
            return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"status": "running" if running else "stopped", "managed": running}


@app.post("/start")
async def start():
    global _process
    if _process and _process.poll() is None:
        return {"status": "already_running", "pid": _process.pid}

    if not HR_SCRIPT.exists():
        return {"status": "error", "error": f"Script not found: {HR_SCRIPT}"}

    HR_INPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find the Python with bleak installed
    python = sys.executable
    _process = subprocess.Popen(
        [python, str(HR_SCRIPT)],
        cwd=str(Path(__file__).parent),
        env={**__import__("os").environ, "OUTPUT_DIR": str(HR_INPUT_DIR.parent)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait briefly to detect immediate crash
    import time
    time.sleep(2)
    if _process.poll() is not None:
        stderr = _process.stderr.read().decode() if _process.stderr else ""
        _process = None
        if "FileNotFoundError" in stderr or "dbus" in stderr.lower():
            return {"status": "error", "error": "Bluetooth not available on this system."}
        lines = [l for l in stderr.strip().splitlines() if l.strip()]
        return {"status": "error", "error": lines[-1] if lines else "Process exited immediately."}

    return {"status": "started", "pid": _process.pid}


@app.post("/stop")
async def stop():
    global _process
    if not _process or _process.poll() is not None:
        _process = None
        if HR_STATUS_FILE.exists():
            HR_STATUS_FILE.unlink(missing_ok=True)
        return {"status": "stopped"}

    _process.send_signal(signal.SIGTERM)
    try:
        _process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _process.kill()

    pid = _process.pid
    _process = None
    HR_STATUS_FILE.unlink(missing_ok=True)
    return {"status": "stopped", "pid": pid}


def _shutdown(signum, frame):
    global _process
    if _process and _process.poll() is None:
        _process.terminate()
        _process.wait(timeout=5)
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    print(f"BLE Service starting on :8001")
    print(f"HR script: {HR_SCRIPT}")
    print(f"HR input dir: {HR_INPUT_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
