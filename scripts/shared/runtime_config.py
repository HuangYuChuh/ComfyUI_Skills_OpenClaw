from __future__ import annotations

from shared.config import CONFIG_PATH, default_config
from shared.json_utils import load_json


def get_runtime_config() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return default_config()

    loaded = load_json(CONFIG_PATH)
    if not isinstance(loaded, dict):
        return default_config()

    defaults = default_config()
    return {
        "comfyui_server_url": str(loaded.get("comfyui_server_url") or defaults["comfyui_server_url"]),
        "output_dir": str(loaded.get("output_dir") or defaults["output_dir"]),
    }
