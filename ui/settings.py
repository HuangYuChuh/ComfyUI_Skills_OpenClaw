from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
WORKFLOWS_DIR = DATA_DIR / "workflows"
SCHEMAS_DIR = DATA_DIR / "schemas"
STATIC_DIR = BASE_DIR / "ui" / "static"
CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
OUTPUTS_DIR = BASE_DIR / "outputs"

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8189
DEFAULT_COMFYUI_SERVER_URL = "http://127.0.0.1:8188"


def ensure_runtime_dirs() -> None:
    for directory in (WORKFLOWS_DIR, SCHEMAS_DIR, STATIC_DIR, OUTPUTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def default_config() -> dict[str, str]:
    return {
        "comfyui_server_url": DEFAULT_COMFYUI_SERVER_URL,
        "output_dir": str(OUTPUTS_DIR),
    }
