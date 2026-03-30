from __future__ import annotations

import sys
import re
import shutil
from dataclasses import dataclass, field
from json import JSONDecodeError
from pathlib import Path
from typing import Any
from uuid import uuid4

# Add scripts to path for shared imports
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "scripts"))

from shared.config import (
    CONFIG_PATH,
    get_server_data_dir,
    get_server_history_dir,
    get_server_schema_path,
    get_server_workflow_path,
    list_server_workflow_dirs,
)
from shared.execution_history import (
    clear_run_records,
    delete_run_record,
    get_run_record,
    list_run_records,
    summarize_run_record,
)
from shared.json_utils import load_json, save_json
from shared.runtime_config import get_runtime_config
try:
    from .workflow_import import WorkflowBulkImporter
except ImportError:
    from workflow_import import WorkflowBulkImporter


def _read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    try:
        return load_json(path)
    except (OSError, JSONDecodeError, TypeError, ValueError):
        return fallback


def _migrate_image_types(params: dict[str, Any], workflow_data: dict[str, Any]) -> None:
    """Upgrade legacy schemas: set type='image' for LoadImage image fields."""
    for param in params.values():
        if not isinstance(param, dict) or param.get("type") == "image":
            continue
        node_id = str(param.get("node_id", ""))
        field = param.get("field", "")
        node_class = param.get("nodeClass", "")
        if not node_class and node_id in workflow_data:
            node_class = str(workflow_data[node_id].get("class_type", ""))
        if node_class == "LoadImage" and field == "image":
            param["type"] = "image"


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
    origin: str = ""
    source_label: str = ""
    tags: list[str] = field(default_factory=list)
    has_history: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.workflow_id,
            "server_id": self.server_id,
            "server_name": self.server_name,
            "enabled": self.enabled,
            "description": self.description,
            "updated_at": self.updated_at,
            "origin": self.origin,
            "source_label": self.source_label,
            "tags": self.tags,
            # Keep the key for backward compatibility with older bundles,
            # but always disable the list-level history entry point.
            "has_history": False,
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
        return [self._serialize_server_for_ui(server) for server in config.get("servers", [])]

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
            "auth": str(server.get("auth") or "").strip(),
            "comfy_api_key": str(server.get("comfy_api_key") or "").strip(),
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
        return self._serialize_server_for_ui(normalized_server)

    def update_server(self, server_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        config = self.get_config()
        for s in config.get("servers", []):
            if s.get("id") == server_id:
                if "name" in updates:
                    s["name"] = str(updates["name"] or "").strip() or server_id
                if "url" in updates:
                    s["url"] = str(updates["url"] or "").strip()
                if "auth" in updates:
                    s["auth"] = str(updates["auth"] or "").strip()
                if "comfy_api_key" in updates:
                    s["comfy_api_key"] = str(updates["comfy_api_key"] or "").strip()
                if "enabled" in updates:
                    s["enabled"] = bool(updates["enabled"])
                if "output_dir" in updates:
                    s["output_dir"] = str(updates["output_dir"] or "./outputs").strip() or "./outputs"
                self.save_config(config)
                return self._serialize_server_for_ui(s)
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
        current_default_server = str(config.get("default_server") or "").strip()
        remaining_server_ids = {
            str(server.get("id") or "").strip()
            for server in new_servers
            if str(server.get("id") or "").strip()
        }
        if current_default_server == server_id or current_default_server not in remaining_server_ids:
            config["default_server"] = (
                str(new_servers[0].get("id") or "").strip()
                if new_servers
                else ""
            )
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
                origin = ""
                source_label = ""
                tags: list[str] = []
                try:
                    schema_data = _read_json(schema_path, fallback={})
                    if isinstance(schema_data, dict):
                        enabled = bool(schema_data.get("enabled", True))
                        description = str(schema_data.get("description") or "")
                        origin = str(schema_data.get("origin") or "")
                        source_label = str(schema_data.get("source_label") or "")
                        raw_tags = schema_data.get("tags")
                        if isinstance(raw_tags, list):
                            tags = [str(tag) for tag in raw_tags if str(tag).strip()]
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
                    origin=origin,
                    source_label=source_label,
                    tags=tags,
                    has_history=False,
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

        run_params = schema_data.get("parameters", {})
        ui_params = schema_data.get("ui_parameters") or run_params
        _migrate_image_types(run_params, workflow_data)
        _migrate_image_types(ui_params, workflow_data)

        return {
            "workflow_id": workflow_id,
            "server_id": server_id,
            "description": str(schema_data.get("description") or ""),
            "enabled": bool(schema_data.get("enabled", True)),
            "workflow_data": workflow_data,
            "schema_params": ui_params,
            "run_schema_params": run_params,
            "origin": str(schema_data.get("origin") or ""),
            "source_label": str(schema_data.get("source_label") or ""),
            "tags": [str(tag) for tag in schema_data.get("tags", [])] if isinstance(schema_data.get("tags"), list) else [],
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
        origin: str = "",
        source_label: str = "",
        tags: list[str] | None = None,
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
        existing_origin = ""
        existing_source_label = ""
        existing_tags: list[str] = []
        if isinstance(existing_schema, dict):
            enabled = bool(existing_schema.get("enabled", True))
            existing_origin = str(existing_schema.get("origin") or "")
            existing_source_label = str(existing_schema.get("source_label") or "")
            raw_existing_tags = existing_schema.get("tags")
            if isinstance(raw_existing_tags, list):
                existing_tags = [str(tag) for tag in raw_existing_tags if str(tag).strip()]

        _write_json(workflow_path, workflow_data)
        schema = {
            "description": description,
            "enabled": enabled,
            "parameters": schema_params,
            "ui_parameters": ui_schema_params or {},
            "origin": origin or existing_origin,
            "source_label": source_label or existing_source_label,
            "tags": tags or existing_tags,
        }
        _write_json(schema_path, schema)

        self._sync_workflow_order(server_id, source_workflow_id, workflow_id)

        if source_workflow_id != workflow_id:
            source_dir = source_workflow_path.parent
            source_history_dir = self._history_dir(server_id, source_workflow_id)
            target_history_dir = self._history_dir(server_id, workflow_id)
            self._merge_workflow_history(source_history_dir, target_history_dir)
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

    def next_available_workflow_id(
        self,
        server_id: str,
        workflow_id: str,
        reserved_ids: set[str] | None = None,
    ) -> str:
        existing_ids = {workflow.workflow_id for workflow in self.list_workflows(server_id)}
        blocked_ids = existing_ids | (reserved_ids or set())
        if workflow_id not in blocked_ids:
            return workflow_id

        index = 2
        while True:
            candidate = f"{workflow_id}-{index}"
            if candidate not in blocked_ids:
                return candidate
            index += 1

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
        history_dir = self._history_dir(server_id, workflow_id)
        if history_dir.exists():
            shutil.rmtree(history_dir, ignore_errors=False)
        for path in (self._workflow_path(server_id, workflow_id), self._schema_path(server_id, workflow_id)):
            if path.exists():
                path.unlink()
        if workflow_dir.exists():
            try:
                workflow_dir.rmdir()
            except OSError:
                pass
        self._remove_workflow_from_order(server_id, workflow_id)

    def delete_workflows(self, server_id: str, workflow_ids: list[str]) -> dict[str, list[str]]:
        config = self.get_config()
        if self._get_server_entry(config, server_id) is None:
            raise FileNotFoundError(f"Server '{server_id}' not found")

        deleted: list[str] = []
        missing: list[str] = []

        for workflow_id in workflow_ids:
            workflow_path = self._workflow_path(server_id, workflow_id)
            schema_path = self._schema_path(server_id, workflow_id)
            history_dir = self._history_dir(server_id, workflow_id)

            if not workflow_path.exists() and not schema_path.exists() and not history_dir.exists():
                missing.append(workflow_id)
                continue

            self.delete_workflow(server_id, workflow_id)
            deleted.append(workflow_id)

        return {"deleted": deleted, "missing": missing}

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

    def import_workflows_from_comfyui(self, server_id: str) -> dict[str, Any]:
        importer = WorkflowBulkImporter(self, server_id)
        return importer.import_from_comfyui().to_dict()

    def preview_workflows_from_comfyui(self, server_id: str) -> dict[str, Any]:
        importer = WorkflowBulkImporter(self, server_id)
        return importer.preview_from_comfyui().to_dict()

    def import_local_workflows(self, server_id: str, files: list[dict[str, str]]) -> dict[str, Any]:
        importer = WorkflowBulkImporter(self, server_id)
        return importer.import_local_files(files).to_dict()

    def list_workflow_history(self, server_id: str, workflow_id: str) -> list[dict[str, Any]]:
        self._require_workflow_exists(server_id, workflow_id)
        return [summarize_run_record(record) for record in list_run_records(server_id, workflow_id)]

    def get_workflow_history_entry(self, server_id: str, workflow_id: str, run_id: str) -> dict[str, Any]:
        self._require_workflow_exists(server_id, workflow_id)
        return get_run_record(server_id, workflow_id, run_id)

    def get_workflow_history_image_path(self, server_id: str, workflow_id: str, run_id: str, image_index: int) -> Path:
        self._require_workflow_exists(server_id, workflow_id)
        record = get_run_record(server_id, workflow_id, run_id)
        result = record.get("result") if isinstance(record.get("result"), dict) else {}
        raw_images = result.get("images") if isinstance(result.get("images"), list) else []
        images = [str(path).strip() for path in raw_images if str(path).strip()]

        if image_index < 0 or image_index >= len(images):
            raise FileNotFoundError(f"{run_id}:{image_index}")

        output_dir = self._resolve_server_output_dir(server_id).resolve()
        image_path = Path(images[image_index]).expanduser()
        if not image_path.is_absolute():
            image_path = output_dir / image_path
        resolved_image_path = image_path.resolve()

        try:
            resolved_image_path.relative_to(output_dir)
        except ValueError as exc:
            raise PermissionError("History image path is outside the configured output directory") from exc

        if not resolved_image_path.exists() or not resolved_image_path.is_file():
            raise FileNotFoundError(f"{run_id}:{image_index}")

        return resolved_image_path

    def delete_workflow_history_entry(self, server_id: str, workflow_id: str, run_id: str) -> None:
        self._require_workflow_exists(server_id, workflow_id)
        delete_run_record(server_id, workflow_id, run_id)

    def clear_workflow_history(self, server_id: str, workflow_id: str) -> int:
        self._require_workflow_exists(server_id, workflow_id)
        return clear_run_records(server_id, workflow_id)

    @staticmethod
    def _workflow_path(server_id: str, workflow_id: str) -> Path:
        return get_server_workflow_path(server_id, workflow_id)

    @staticmethod
    def _schema_path(server_id: str, workflow_id: str) -> Path:
        return get_server_schema_path(server_id, workflow_id)

    @staticmethod
    def _history_dir(server_id: str, workflow_id: str) -> Path:
        return get_server_history_dir(server_id, workflow_id)

    def _workflow_has_history(self, server_id: str, workflow_id: str) -> bool:
        history_dir = self._history_dir(server_id, workflow_id)
        return history_dir.exists() and any(history_dir.glob("*.json"))

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

    def _resolve_server_output_dir(self, server_id: str) -> Path:
        config = self.get_config()
        server = self._get_server_entry(config, server_id)
        if server is None:
            raise FileNotFoundError(server_id)

        output_dir = Path(str(server.get("output_dir") or "./outputs").strip() or "./outputs").expanduser()
        if not output_dir.is_absolute():
            output_dir = (_project_root / output_dir).resolve()
        else:
            output_dir = output_dir.resolve()
        return output_dir

    @staticmethod
    def _serialize_server_for_ui(server: dict[str, Any]) -> dict[str, Any]:
        server_type = str(server.get("server_type") or "").strip()
        unsupported = bool(server_type and server_type != "comfyui")

        payload = {
            "id": str(server.get("id") or "").strip(),
            "name": str(server.get("name") or "").strip(),
            "url": str(server.get("url") or "").strip(),
            "auth": str(server.get("auth") or ""),
            "comfy_api_key": str(server.get("comfy_api_key") or ""),
            "enabled": bool(server.get("enabled", True)),
            "output_dir": str(server.get("output_dir") or "./outputs").strip() or "./outputs",
            "unsupported": unsupported,
        }

        if server_type:
            payload["server_type"] = server_type

        if unsupported:
            payload["unsupported_reason"] = f"Server type '{server_type}' is not supported in this branch."

        return payload

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

    def _require_workflow_exists(self, server_id: str, workflow_id: str) -> None:
        if not self._workflow_path(server_id, workflow_id).exists() or not self._schema_path(server_id, workflow_id).exists():
            raise FileNotFoundError(workflow_id)

    def _merge_workflow_history(self, source_history_dir: Path, target_history_dir: Path) -> None:
        if not source_history_dir.exists() or source_history_dir == target_history_dir:
            return

        if not target_history_dir.exists():
            target_history_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source_history_dir), str(target_history_dir))
            return

        target_history_dir.mkdir(parents=True, exist_ok=True)

        for source_path in source_history_dir.glob("*.json"):
            if not source_path.is_file():
                continue

            target_path = target_history_dir / source_path.name
            if not target_path.exists():
                shutil.move(str(source_path), str(target_path))
                continue

            payload = _read_json(source_path, fallback=None)
            if not isinstance(payload, dict):
                source_path.unlink()
                continue

            new_run_id = str(uuid4())
            payload["run_id"] = new_run_id
            _write_json(target_history_dir / f"{new_run_id}.json", payload)
            source_path.unlink()

        try:
            source_history_dir.rmdir()
        except OSError:
            pass
