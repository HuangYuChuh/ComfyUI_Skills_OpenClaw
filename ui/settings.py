from __future__ import annotations

import os
from pathlib import Path

from shared.config import (
    DATA_DIR,
    get_server_data_dir,
)
from shared.runtime_config import get_runtime_config

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "ui" / "static"
CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
OUTPUTS_DIR = BASE_DIR / "outputs"

DEFAULT_HOST = "127.0.0.1"


def _read_default_port() -> int:
    raw = os.environ.get("OPENCLAW_UI_PORT", "18189").strip()
    try:
        port = int(raw)
    except ValueError:
        return 18189
    return port if 1 <= port <= 65535 else 18189


DEFAULT_PORT = _read_default_port()
DEFAULT_COMFYUI_SERVER_URL = "http://127.0.0.1:8188"


def ensure_runtime_dirs() -> None:
    """Create data directories for all configured servers."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    config = get_runtime_config()
    for server in config.get("servers", []):
        server_id = server.get("id")
        if server_id:
            get_server_data_dir(server_id).mkdir(parents=True, exist_ok=True)


def default_config() -> dict[str, str]:
    return {
        "comfyui_server_url": DEFAULT_COMFYUI_SERVER_URL,
        "output_dir": "./outputs",
    }
