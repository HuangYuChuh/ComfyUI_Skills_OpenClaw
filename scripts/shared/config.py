from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = BASE_DIR / "config.json"
DATA_DIR = BASE_DIR / "data"
OUTPUTS_DIR = BASE_DIR / "outputs"
WORKFLOW_FILENAME = "workflow.json"
SCHEMA_FILENAME = "schema.json"
DEFAULT_COMFYUI_SERVER_URL = "http://127.0.0.1:8188"
DEFAULT_SERVER_ID = "local"
DEFAULT_OUTPUT_DIR = "./outputs"


def default_server() -> dict[str, object]:
    return {
        "id": DEFAULT_SERVER_ID,
        "name": "Local",
        "url": DEFAULT_COMFYUI_SERVER_URL,
        "enabled": True,
        "output_dir": DEFAULT_OUTPUT_DIR,
    }


def default_config() -> dict[str, object]:
    return {
        "servers": [default_server()],
        "default_server": DEFAULT_SERVER_ID,
    }


def get_server_data_dir(server_id: str) -> Path:
    """Return the data directory for a specific server."""
    return DATA_DIR / server_id


def get_server_workflow_dir(server_id: str, workflow_id: str) -> Path:
    """Return the directory that stores one workflow and its schema."""
    return get_server_data_dir(server_id) / workflow_id


def get_server_workflow_path(server_id: str, workflow_id: str) -> Path:
    return get_server_workflow_dir(server_id, workflow_id) / WORKFLOW_FILENAME


def get_server_schema_path(server_id: str, workflow_id: str) -> Path:
    return get_server_workflow_dir(server_id, workflow_id) / SCHEMA_FILENAME


def list_server_workflow_dirs(server_id: str) -> list[Path]:
    server_dir = get_server_data_dir(server_id)
    if not server_dir.exists():
        return []
    return sorted(
        [path for path in server_dir.iterdir() if path.is_dir() and not path.name.startswith(".")],
        key=lambda path: path.name.lower(),
    )


def get_legacy_server_workflows_dir(server_id: str) -> Path:
    return get_server_data_dir(server_id) / "workflows"


def get_legacy_server_schemas_dir(server_id: str) -> Path:
    return get_server_data_dir(server_id) / "schemas"
