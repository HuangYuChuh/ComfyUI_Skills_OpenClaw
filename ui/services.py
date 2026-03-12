from __future__ import annotations

import sys
import re
import shutil
from dataclasses import dataclass, field
from json import JSONDecodeError
from pathlib import Path
from typing import Any

# Add scripts to path for shared imports
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "scripts"))

from shared.config import (
    CONFIG_PATH,
    get_server_data_dir,
    get_server_schema_path,
    get_server_workflow_path,
    list_server_workflow_dirs,
)
from shared.json_utils import load_json, save_json
from shared.runtime_config import get_runtime_config


def _read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    try:
        return load_json(path)
    except (OSError, JSONDecodeError, TypeError, ValueError):
        return fallback


def _write_json(path: Path, data: Any) -> None:
    save_json(path, data)


@dataclass(slots=True)
class WorkflowSummary:
    workflow_id: str
    server_id: str
    server_name: str
    enabled: bool
    description: str = ""
    updated_at: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.workflow_id,
            "server_id": self.server_id,
            "server_name": self.server_name,
            "enabled": self.enabled,
            "description": self.description,
            "updated_at": self.updated_at,
        }


class UIStorageService:
    # ── Config ────────────────────────────────────────────────────

    def get_config(self) -> dict[str, Any]:
        return get_runtime_config()

    def save_config(self, config: dict[str, Any]) -> dict[str, Any]:
        _write_json(CONFIG_PATH, config)
        return config

    # ── Server CRUD ───────────────────────────────────────────────

    def list_servers(self) -> list[dict[str, Any]]:
        config = self.get_config()
        return config.get("servers", [])

    def add_server(self, server: dict[str, Any]) -> dict[str, Any]:
        config = self.get_config()
        servers = config.get("servers", [])
        existing_ids = {str(s.get("id", "")).strip() for s in servers if s.get("id")}

        raw_id = str(server.get("id") or "").strip()
        raw_name = str(server.get("name") or "").strip()
        server_id = raw_id or self._next_server_id(existing_ids, seed=raw_name or "server")
        server_name = raw_name or server_id

        if any(c in server_id for c in ("/", "\\", " ")) or server_id in {".", ".."}:
            raise ValueError("Server ID contains invalid characters")

        # Duplicate check
        if server_id in existing_ids:
            raise FileExistsError(f"Server '{server_id}' already exists")

        normalized_server = {
            "id": server_id,
            "name": server_name,
            "url": str(server.get("url") or "").strip(),
            "enabled": bool(server.get("enabled", True)),
            "output_dir": str(server.get("output_dir") or "./outputs").strip() or "./outputs",
            "workflow_order": [],
        }

        servers.append(normalized_server)
        config["servers"] = servers

        # Create directories
        sid = server_id
        get_server_data_dir(sid).mkdir(parents=True, exist_ok=True)

        self.save_config(config)
        return normalized_server

    def update_server(self, server_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        config = self.get_config()
        for s in config.get("servers", []):
            if s.get("id") == server_id:
                for key in ("name", "url", "enabled", "output_dir"):
                    if key in updates:
                        s[key] = updates[key]
                self.save_config(config)
                return s
        raise FileNotFoundError(f"Server '{server_id}' not found")

    def toggle_server(self, server_id: str, enabled: bool) -> dict[str, Any]:
        return self.update_server(server_id, {"enabled": enabled})

    def delete_server(self, server_id: str, delete_data: bool = False) -> None:
        config = self.get_config()
        servers = config.get("servers", [])
        new_servers = [s for s in servers if s.get("id") != server_id]
        if len(new_servers) == len(servers):
            raise FileNotFoundError(f"Server '{server_id}' not found")
        config["servers"] = new_servers
        self.save_config(config)

        if delete_data:
            server_dir = get_server_data_dir(server_id)
            if server_dir.exists():
                shutil.rmtree(server_dir, ignore_errors=False)

    # ── Workflow CRUD ─────────────────────────────────────────────

    def list_workflows(self, server_id: str | None = None) -> list[WorkflowSummary]:
        """List workflows. If server_id is None, list across all servers."""
        config = self.get_config()
        servers = config.get("servers", [])
        workflows: list[WorkflowSummary] = []

        target_servers = servers
        if server_id:
            target_servers = [s for s in servers if s.get("id") == server_id]

        for server in target_servers:
            sid = server.get("id", "")
            sname = server.get("name", sid)
            workflow_order = [
                str(workflow_id).strip()
                for workflow_id in server.get("workflow_order", [])
                if str(workflow_id).strip()
            ]
            order_index = {workflow_id: index for index, workflow_id in enumerate(workflow_order)}

            server_workflows: list[WorkflowSummary] = []

            for workflow_dir in list_server_workflow_dirs(sid):
                wf_id = workflow_dir.name
                schema_path = self._schema_path(sid, wf_id)
                if not schema_path.exists():
                    continue
                enabled = True
                description = ""
                try:
                    schema_data = _read_json(schema_path, fallback={})
                    if isinstance(schema_data, dict):
                        enabled = bool(schema_data.get("enabled", True))
                        description = str(schema_data.get("description") or "")
                except Exception:
                    enabled = True

                server_workflows.append(WorkflowSummary(
                    workflow_id=wf_id,
                    server_id=sid,
                    server_name=sname,
                    enabled=enabled,
                    description=description,
                    updated_at=max(
                        schema_path.stat().st_mtime,
                        self._workflow_path(sid, wf_id).stat().st_mtime if self._workflow_path(sid, wf_id).exists() else 0.0,
                    ),
                ))

            server_workflows.sort(
                key=lambda workflow: (
                    order_index.get(workflow.workflow_id, len(order_index)),
                    workflow.workflow_id.lower(),
                ),
            )
            workflows.extend(server_workflows)

        return workflows

    def get_workflow_detail(self, server_id: str, workflow_id: str) -> dict[str, Any]:
        workflow_path = self._workflow_path(server_id, workflow_id)
        schema_path = self._schema_path(server_id, workflow_id)
        if not workflow_path.exists() or not schema_path.exists():
            raise FileNotFoundError(workflow_id)

        workflow_data = _read_json(workflow_path, fallback=None)
        schema_data = _read_json(schema_path, fallback=None)
        if not isinstance(workflow_data, dict) or not isinstance(schema_data, dict):
            raise ValueError(f"Workflow data is invalid for {workflow_id}")

        return {
            "workflow_id": workflow_id,
            "server_id": server_id,
            "description": str(schema_data.get("description") or ""),
            "enabled": bool(schema_data.get("enabled", True)),
            "workflow_data": workflow_data,
            "schema_params": schema_data.get("ui_parameters") or schema_data.get("parameters", {}),
        }

    def save_workflow(
        self,
        server_id: str,
        workflow_id: str,
        original_workflow_id: str | None,
        overwrite_existing: bool,
        description: str,
        workflow_data: dict[str, Any],
        schema_params: dict[str, Any],
        ui_schema_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        source_workflow_id = original_workflow_id or workflow_id
        workflow_path = self._workflow_path(server_id, workflow_id)
        schema_path = self._schema_path(server_id, workflow_id)
        source_workflow_path = self._workflow_path(server_id, source_workflow_id)
        source_schema_path = self._schema_path(server_id, source_workflow_id)
        target_exists = workflow_path.exists() or schema_path.exists()
        is_same_workflow = original_workflow_id is not None and source_workflow_id == workflow_id

        if target_exists and not overwrite_existing and not is_same_workflow:
            raise FileExistsError(workflow_id)

        existing_schema = _read_json(source_schema_path, fallback={})
        enabled = True
        if isinstance(existing_schema, dict):
            enabled = bool(existing_schema.get("enabled", True))

        _write_json(workflow_path, workflow_data)
        schema = {
            "description": description,
            "enabled": enabled,
            "parameters": schema_params,
            "ui_parameters": ui_schema_params or {},
        }
        _write_json(schema_path, schema)

        self._sync_workflow_order(server_id, source_workflow_id, workflow_id)

        if source_workflow_id != workflow_id:
            source_dir = source_workflow_path.parent
            if source_workflow_path.exists():
                source_workflow_path.unlink()
            if source_schema_path.exists():
                source_schema_path.unlink()
            if source_dir.exists():
                try:
                    source_dir.rmdir()
                except OSError:
                    pass

        return schema

    def toggle_workflow(self, server_id: str, workflow_id: str, enabled: bool) -> dict[str, Any]:
        schema_path = self._schema_path(server_id, workflow_id)
        if not schema_path.exists():
            raise FileNotFoundError(workflow_id)

        schema = _read_json(schema_path, fallback={})
        if not isinstance(schema, dict):
            schema = {}

        schema.pop("workflow_id", None)
        schema["enabled"] = enabled
        schema.setdefault("description", "")
        schema.setdefault("parameters", {})
        _write_json(schema_path, schema)
        return schema

    def delete_workflow(self, server_id: str, workflow_id: str) -> None:
        workflow_dir = self._workflow_path(server_id, workflow_id).parent
        for path in (self._workflow_path(server_id, workflow_id), self._schema_path(server_id, workflow_id)):
            if path.exists():
                path.unlink()
        if workflow_dir.exists():
            try:
                workflow_dir.rmdir()
            except OSError:
                pass
        self._remove_workflow_from_order(server_id, workflow_id)

    def reorder_workflows(self, server_id: str, workflow_ids: list[str]) -> list[str]:
        config = self.get_config()
        server = self._get_server_entry(config, server_id)
        if server is None:
            raise FileNotFoundError(f"Server '{server_id}' not found")

        available_ids = {workflow.workflow_id for workflow in self.list_workflows(server_id)}
        normalized_order = [workflow_id for workflow_id in workflow_ids if workflow_id in available_ids]

        if not normalized_order:
            raise ValueError("No valid workflows were provided for ordering")

        remaining_ids = sorted(available_ids - set(normalized_order), key=str.lower)
        final_order = normalized_order + remaining_ids

        server["workflow_order"] = final_order
        self.save_config(config)
        return final_order

    @staticmethod
    def _workflow_path(server_id: str, workflow_id: str) -> Path:
        return get_server_workflow_path(server_id, workflow_id)

    @staticmethod
    def _schema_path(server_id: str, workflow_id: str) -> Path:
        return get_server_schema_path(server_id, workflow_id)

    @staticmethod
    def _slugify_server_id(value: str) -> str:
        # Keep Unicode letters/numbers so non-English names do not collapse to "server".
        text = re.sub(r"[^\w-]+", "-", value.strip().lower(), flags=re.UNICODE)
        text = text.strip("-_")
        return text or "server"

    def _next_server_id(self, existing_ids: set[str], seed: str) -> str:
        base = self._slugify_server_id(seed)
        if base not in existing_ids:
            return base

        index = 2
        while True:
            candidate = f"{base}-{index}"
            if candidate not in existing_ids:
                return candidate
            index += 1

    def _get_server_entry(self, config: dict[str, Any], server_id: str) -> dict[str, Any] | None:
        for server in config.get("servers", []):
            if server.get("id") == server_id:
                return server
        return None

    def _sync_workflow_order(self, server_id: str, source_workflow_id: str, workflow_id: str) -> None:
        config = self.get_config()
        server = self._get_server_entry(config, server_id)
        if server is None:
            return

        workflow_order = [str(item).strip() for item in server.get("workflow_order", []) if str(item).strip()]
        if source_workflow_id == workflow_id:
            if workflow_id not in workflow_order:
                workflow_order.append(workflow_id)
        else:
            replaced = False
            next_order: list[str] = []
            for existing_workflow_id in workflow_order:
                if existing_workflow_id == source_workflow_id:
                    if not replaced:
                        next_order.append(workflow_id)
                        replaced = True
                    continue
                if existing_workflow_id != workflow_id:
                    next_order.append(existing_workflow_id)

            if not replaced:
                next_order.append(workflow_id)
            workflow_order = next_order

        server["workflow_order"] = workflow_order
        self.save_config(config)

    def _remove_workflow_from_order(self, server_id: str, workflow_id: str) -> None:
        config = self.get_config()
        server = self._get_server_entry(config, server_id)
        if server is None:
            return

        server["workflow_order"] = [
            str(item).strip()
            for item in server.get("workflow_order", [])
            if str(item).strip() and str(item).strip() != workflow_id
        ]
        self.save_config(config)
