from __future__ import annotations

from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any

try:
    from .json_store import read_json, write_json
    from .settings import CONFIG_PATH, SCHEMAS_DIR, WORKFLOWS_DIR, default_config
except ImportError:
    from json_store import read_json, write_json
    from settings import CONFIG_PATH, SCHEMAS_DIR, WORKFLOWS_DIR, default_config


@dataclass(slots=True)
class WorkflowSummary:
    workflow_id: str
    enabled: bool

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.workflow_id, "enabled": self.enabled}


class UIStorageService:
    def get_config(self) -> dict[str, str]:
        defaults = default_config()
        config = read_json(CONFIG_PATH, fallback=None)
        if not isinstance(config, dict):
            return defaults

        return {
            "comfyui_server_url": str(config.get("comfyui_server_url") or defaults["comfyui_server_url"]),
            "output_dir": str(config.get("output_dir") or defaults["output_dir"]),
        }

    def save_config(self, config: dict[str, str]) -> dict[str, str]:
        write_json(CONFIG_PATH, config)
        return config

    def list_workflows(self) -> list[WorkflowSummary]:
        workflows: list[WorkflowSummary] = []
        if not SCHEMAS_DIR.exists():
            return workflows

        for schema_path in sorted(SCHEMAS_DIR.glob("*.json")):
            workflow_id = schema_path.stem
            enabled = True
            try:
                schema_data = read_json(schema_path, fallback={})
                if isinstance(schema_data, dict):
                    enabled = bool(schema_data.get("enabled", True))
                    workflow_id = str(schema_data.get("workflow_id") or workflow_id)
            except (OSError, JSONDecodeError, TypeError, ValueError):
                enabled = True

            workflows.append(WorkflowSummary(workflow_id=workflow_id, enabled=enabled))

        return workflows

    def get_workflow_detail(self, workflow_id: str) -> dict[str, Any]:
        workflow_path = self._workflow_path(workflow_id)
        schema_path = self._schema_path(workflow_id)
        if not workflow_path.exists() or not schema_path.exists():
            raise FileNotFoundError(workflow_id)

        workflow_data = read_json(workflow_path, fallback=None)
        schema_data = read_json(schema_path, fallback=None)
        if not isinstance(workflow_data, dict) or not isinstance(schema_data, dict):
            raise ValueError(f"Workflow data is invalid for {workflow_id}")

        return {
            "workflow_id": str(schema_data.get("workflow_id") or workflow_id),
            "description": str(schema_data.get("description") or ""),
            "enabled": bool(schema_data.get("enabled", True)),
            "workflow_data": workflow_data,
            "schema_params": schema_data.get("parameters", {}),
        }

    def save_workflow(
        self,
        workflow_id: str,
        original_workflow_id: str | None,
        overwrite_existing: bool,
        description: str,
        workflow_data: dict[str, Any],
        schema_params: dict[str, Any],
    ) -> dict[str, Any]:
        source_workflow_id = original_workflow_id or workflow_id
        workflow_path = self._workflow_path(workflow_id)
        schema_path = self._schema_path(workflow_id)
        source_workflow_path = self._workflow_path(source_workflow_id)
        source_schema_path = self._schema_path(source_workflow_id)
        target_exists = workflow_path.exists() or schema_path.exists()
        is_same_workflow = original_workflow_id is not None and source_workflow_id == workflow_id

        if target_exists and not overwrite_existing and not is_same_workflow:
            raise FileExistsError(workflow_id)

        existing_schema = read_json(source_schema_path, fallback={})
        enabled = True
        if isinstance(existing_schema, dict):
            enabled = bool(existing_schema.get("enabled", True))

        write_json(workflow_path, workflow_data)
        schema = {
            "workflow_id": workflow_id,
            "description": description,
            "enabled": enabled,
            "parameters": schema_params,
        }
        write_json(schema_path, schema)

        if source_workflow_id != workflow_id:
            for obsolete_path in (source_workflow_path, source_schema_path):
                if obsolete_path.exists():
                    obsolete_path.unlink()

        return schema

    def toggle_workflow(self, workflow_id: str, enabled: bool) -> dict[str, Any]:
        schema_path = self._schema_path(workflow_id)
        if not schema_path.exists():
            raise FileNotFoundError(workflow_id)

        schema = read_json(schema_path, fallback={})
        if not isinstance(schema, dict):
            schema = {}

        schema["workflow_id"] = str(schema.get("workflow_id") or workflow_id)
        schema["enabled"] = enabled
        schema.setdefault("description", "")
        schema.setdefault("parameters", {})
        write_json(schema_path, schema)
        return schema

    def delete_workflow(self, workflow_id: str) -> None:
        for path in (self._workflow_path(workflow_id), self._schema_path(workflow_id)):
            if path.exists():
                path.unlink()

    @staticmethod
    def _workflow_path(workflow_id: str):
        return WORKFLOWS_DIR / f"{workflow_id}.json"

    @staticmethod
    def _schema_path(workflow_id: str):
        return SCHEMAS_DIR / f"{workflow_id}.json"
