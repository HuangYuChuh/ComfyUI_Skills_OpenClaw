from __future__ import annotations

import shutil
from pathlib import Path

from shared.config import (
    CONFIG_PATH,
    DATA_DIR,
    DEFAULT_SERVER_ID,
    SCHEMA_FILENAME,
    WORKFLOW_FILENAME,
    default_config,
    default_server,
    get_legacy_server_schemas_dir,
    get_legacy_server_workflows_dir,
    get_server_data_dir,
    get_server_schema_path,
    get_server_workflow_path,
)
from shared.json_utils import load_json, save_json


def migrate_legacy_config() -> None:
    """Detect old flat config format and migrate to the new multi-server format.

    Old format:
        { "comfyui_server_url": "...", "output_dir": "..." }

    New format:
        { "servers": [ { "id": "local", ... } ], "default_server": "local" }

    Also migrates the old split workflow/schema storage into per-workflow folders under data/local/.
    """
    if not CONFIG_PATH.exists():
        return

    config = load_json(CONFIG_PATH)
    if not isinstance(config, dict):
        return

    # Already in new format
    if "servers" in config:
        return

    # Detect legacy flat format
    old_url = config.get("comfyui_server_url")
    old_output = config.get("output_dir")

    server = default_server()
    if old_url:
        server["url"] = old_url
    if old_output:
        server["output_dir"] = old_output

    new_config = {
        "servers": [server],
        "default_server": DEFAULT_SERVER_ID,
    }
    save_json(CONFIG_PATH, new_config)

    # Migrate data directories
    migrate_workflow_storage_layout()


def _migrate_server_storage_layout(server_id: str) -> None:
    server_dir = get_server_data_dir(server_id)
    legacy_workflows_dir = get_legacy_server_workflows_dir(server_id)
    legacy_schemas_dir = get_legacy_server_schemas_dir(server_id)

    legacy_ids: set[str] = set()
    if legacy_workflows_dir.exists():
        legacy_ids.update(path.stem for path in legacy_workflows_dir.glob("*.json"))
    if legacy_schemas_dir.exists():
        legacy_ids.update(path.stem for path in legacy_schemas_dir.glob("*.json"))

    for workflow_id in sorted(legacy_ids):
        legacy_workflow_path = legacy_workflows_dir / f"{workflow_id}.json"
        legacy_schema_path = legacy_schemas_dir / f"{workflow_id}.json"
        workflow_path = get_server_workflow_path(server_id, workflow_id)
        schema_path = get_server_schema_path(server_id, workflow_id)

        if legacy_workflow_path.exists() and not workflow_path.exists():
            workflow_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(legacy_workflow_path), str(workflow_path))

        if legacy_schema_path.exists() and not schema_path.exists():
            schema_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(legacy_schema_path), str(schema_path))

    for legacy_dir in (legacy_workflows_dir, legacy_schemas_dir):
        if legacy_dir.exists():
            try:
                legacy_dir.rmdir()
            except OSError:
                pass

    # Remove empty workflow directories that may remain after migrations or deletes.
    if server_dir.exists():
        for workflow_dir in server_dir.iterdir():
            if not workflow_dir.is_dir():
                continue
            if workflow_dir.name in {"workflows", "schemas"}:
                continue
            has_workflow = (workflow_dir / WORKFLOW_FILENAME).exists()
            has_schema = (workflow_dir / SCHEMA_FILENAME).exists()
            if not has_workflow and not has_schema:
                try:
                    workflow_dir.rmdir()
                except OSError:
                    pass


def migrate_workflow_storage_layout() -> None:
    """Migrate old split workflow/schema directories into per-workflow folders."""
    if not DATA_DIR.exists():
        return

    _migrate_server_storage_layout(DEFAULT_SERVER_ID)

    for server_dir in DATA_DIR.iterdir():
        if not server_dir.is_dir():
            continue
        if server_dir.name in {"workflows", "schemas"}:
            continue
        _migrate_server_storage_layout(server_dir.name)


def get_runtime_config() -> dict[str, object]:
    """Load the full multi-server config, migrating from legacy format if needed."""
    migrate_legacy_config()
    migrate_workflow_storage_layout()

    if not CONFIG_PATH.exists():
        return default_config()

    loaded = load_json(CONFIG_PATH)
    if not isinstance(loaded, dict) or "servers" not in loaded:
        return default_config()

    return loaded


def get_server_by_id(server_id: str) -> dict[str, object] | None:
    """Look up a single server entry by its id."""
    config = get_runtime_config()
    for server in config.get("servers", []):
        if isinstance(server, dict) and server.get("id") == server_id:
            return server
    return None


def get_default_server_id() -> str:
    """Return the default server id from config."""
    config = get_runtime_config()
    return str(config.get("default_server", DEFAULT_SERVER_ID))
