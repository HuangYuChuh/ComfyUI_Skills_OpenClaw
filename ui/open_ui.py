#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from settings import DEFAULT_HOST, DEFAULT_PORT  # noqa: E402


def build_ui_url() -> str:
    host = DEFAULT_HOST if DEFAULT_HOST not in {"0.0.0.0", "::"} else "127.0.0.1"
    return f"http://{host}:{DEFAULT_PORT}"


def is_ui_ready(url: str, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 500
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def wait_until_ready(url: str, timeout_seconds: float) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if is_ui_ready(url):
            return True
        time.sleep(0.5)
    return False


def start_ui_process(python_bin: str) -> tuple[subprocess.Popen[bytes], Path]:
    log_path = SCRIPT_DIR / "ui.log"
    log_handle = log_path.open("ab")
    launcher = SCRIPT_DIR / "run_ui.sh"
    kwargs: dict[str, object] = {
        "cwd": str(ROOT_DIR),
        "stdin": subprocess.DEVNULL,
        "stdout": log_handle,
        "stderr": subprocess.STDOUT,
        "close_fds": os.name != "nt",
    }

    # 使用独立会话启动，避免 Agent 进程退出时把 UI 一起带走。
    if os.name == "nt":
        detached = getattr(subprocess, "DETACHED_PROCESS", 0)
        new_group = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        kwargs["creationflags"] = detached | new_group
    else:
        kwargs["start_new_session"] = True

    if os.name == "nt":
        process = subprocess.Popen([python_bin, str(SCRIPT_DIR / "app.py")], **kwargs)
    else:
        env = os.environ.copy()
        env.setdefault("PYTHON_BIN", python_bin)
        kwargs["env"] = env
        process = subprocess.Popen([str(launcher)], **kwargs)
    return process, log_path


def open_browser(url: str) -> bool:
    try:
        return bool(webbrowser.open(url, new=2, autoraise=True))
    except webbrowser.Error:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the local OpenClaw ComfyUI UI and open it in a browser.")
    parser.add_argument("--no-browser", action="store_true", help="Start the UI without opening a browser window.")
    parser.add_argument("--timeout", type=float, default=20.0, help="Seconds to wait for the UI to become ready.")
    args = parser.parse_args()

    url = build_ui_url()
    python_bin = sys.executable or "python3"

    result = {
        "status": "success",
        "url": url,
        "already_running": False,
        "browser_opened": False,
        "log_path": str(SCRIPT_DIR / "ui.log"),
    }

    if is_ui_ready(url):
        result["already_running"] = True
    else:
        process, log_path = start_ui_process(python_bin)
        result["log_path"] = str(log_path)
        if not wait_until_ready(url, args.timeout):
            print(json.dumps({
                "status": "error",
                "url": url,
                "message": "UI did not become ready in time.",
                "log_path": str(log_path),
                "pid": process.pid,
            }, ensure_ascii=False))
            return 1
        result["pid"] = process.pid

    if not args.no_browser:
        result["browser_opened"] = open_browser(url)

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
