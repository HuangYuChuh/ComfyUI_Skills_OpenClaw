from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = BASE_DIR / "config.json"
OUTPUTS_DIR = BASE_DIR / "outputs"
DEFAULT_COMFYUI_SERVER_URL = "http://127.0.0.1:8188"


def default_config() -> dict[str, str]:
    return {
        "comfyui_server_url": DEFAULT_COMFYUI_SERVER_URL,
        "output_dir": str(OUTPUTS_DIR),
    }
