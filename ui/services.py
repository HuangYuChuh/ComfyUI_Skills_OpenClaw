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
    COMFY_CLOUD_SERVER_TYPE,
    CONFIG_PATH,
    get_server_data_dir,
    get_server_schema_path,
    get_server_workflow_path,
    list_server_workflow_dirs,
    DEFAULT_COMFY_CLOUD_URL,
    DEFAULT_SERVER_TYPE,
)
from shared.cloud_templates import (
    CloudTemplateError,
    build_schema_metadata,
    build_suggested_test_args,
    extract_schema_metadata,
    fetch_official_blueprint_detail,
    fetch_official_blueprints,
    get_bundled_template,
    get_supported_official_template_ids,
    list_bundled_templates,
    load_bundled_template_files,
    load_supported_official_template,
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
    origin: str = "local_upload"
    source_label: str = "Local Upload"
    tags: list[str] = field(default_factory=list)
    supports_direct_run: bool = True

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
            "supports_direct_run": self.supports_direct_run,
        }


class UIStorageService:
    # ── Config ────────────────────────────────────────────────────

    def get_config(self) -> dict[str, Any]:
        return get_runtime_config()

    def get_config_for_ui(self) -> dict[str, Any]:
        config = self.get_config()
        return {
            **config,
            "servers": [
                self._serialize_server_for_ui(self._normalize_server_entry(server))
                for server in config.get("servers", [])
                if isinstance(server, dict)
            ],
        }

    def save_config(self, config: dict[str, Any]) -> dict[str, Any]:
        _write_json(CONFIG_PATH, config)
        return config

    # ── Server CRUD ───────────────────────────────────────────────

    def list_servers(self) -> list[dict[str, Any]]:
        config = self.get_config()
        return [
            self._serialize_server_for_ui(self._normalize_server_entry(server))
            for server in config.get("servers", [])
            if isinstance(server, dict)
        ]

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

        normalized_server = self._normalize_server_entry({
            "id": server_id,
            "name": server_name,
            "server_type": server.get("server_type", DEFAULT_SERVER_TYPE),
            "url": server.get("url", ""),
            "enabled": server.get("enabled", True),
            "output_dir": server.get("output_dir", "./outputs"),
            "api_key": server.get("api_key", ""),
            "api_key_env": server.get("api_key_env", ""),
            "use_api_key_for_partner_nodes": server.get("use_api_key_for_partner_nodes", False),
            "workflow_order": [],
        })

        servers.append(normalized_server)
        config["servers"] = servers

        # Create directories
        sid = server_id
        get_server_data_dir(sid).mkdir(parents=True, exist_ok=True)

        self.save_config(config)

        if normalized_server["server_type"] == COMFY_CLOUD_SERVER_TYPE:
            self.install_default_bundled_templates(sid, overwrite=False)

        return self._serialize_server_for_ui(normalized_server)

    def update_server(self, server_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        config = self.get_config()
        for s in config.get("servers", []):
            if s.get("id") == server_id:
                previous_type = str(s.get("server_type") or DEFAULT_SERVER_TYPE).strip() or DEFAULT_SERVER_TYPE
                keep_api_key = bool(updates.get("keep_api_key"))
                merged = {**s, **updates, "id": server_id}
                if keep_api_key and not str(updates.get("api_key") or "").strip():
                    merged["api_key"] = str(s.get("api_key") or "").strip()
                normalized = self._normalize_server_entry(merged)
                s.clear()
                s.update(normalized)
                self.save_config(config)
                if previous_type != COMFY_CLOUD_SERVER_TYPE and normalized["server_type"] == COMFY_CLOUD_SERVER_TYPE:
                    self.install_default_bundled_templates(server_id, overwrite=False)
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
                        origin = str(schema_data.get("origin") or "local_upload").strip() or "local_upload"
                        source_label = str(schema_data.get("source_label") or "Local Upload").strip() or "Local Upload"
                        tags = [str(tag).strip() for tag in schema_data.get("tags", []) if str(tag).strip()]
                        supports_direct_run = bool(schema_data.get("supports_direct_run", True))
                    else:
                        origin = "local_upload"
                        source_label = "Local Upload"
                        tags = []
                        supports_direct_run = True
                except Exception:
                    enabled = True
                    origin = "local_upload"
                    source_label = "Local Upload"
                    tags = []
                    supports_direct_run = True

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
                    supports_direct_run=supports_direct_run,
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
            "origin": str(schema_data.get("origin") or "local_upload"),
            "source_label": str(schema_data.get("source_label") or "Local Upload"),
            "tags": [str(tag).strip() for tag in schema_data.get("tags", []) if str(tag).strip()],
            "supports_direct_run": bool(schema_data.get("supports_direct_run", True)),
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
        schema_metadata: dict[str, Any] | None = None,
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
            merged_metadata = extract_schema_metadata(existing_schema)
        else:
            merged_metadata = {}

        if schema_metadata:
            merged_metadata.update(schema_metadata)

        if merged_metadata.get("deployment_workflow_id") or merged_metadata.get("template_id"):
            merged_metadata["deployment_workflow_id"] = workflow_id
        if merged_metadata.get("deployment_server_id") or merged_metadata.get("template_id"):
            merged_metadata["deployment_server_id"] = server_id

        _write_json(workflow_path, workflow_data)
        schema = {
            "description": description,
            "enabled": enabled,
            "parameters": schema_params,
            "ui_parameters": ui_schema_params or {},
        }
        schema.update(merged_metadata)
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

    @staticmethod
    def _normalize_server_entry(server: dict[str, Any]) -> dict[str, Any]:
        server_type = str(server.get("server_type") or DEFAULT_SERVER_TYPE).strip() or DEFAULT_SERVER_TYPE
        if server_type not in {DEFAULT_SERVER_TYPE, COMFY_CLOUD_SERVER_TYPE}:
            server_type = DEFAULT_SERVER_TYPE

        url = str(server.get("url") or "").strip()
        api_key = str(server.get("api_key") or "").strip()
        api_key_env = str(server.get("api_key_env") or "").strip()

        if server_type == COMFY_CLOUD_SERVER_TYPE:
            url = url or DEFAULT_COMFY_CLOUD_URL
        else:
            api_key = ""
            api_key_env = ""

        return {
            "id": str(server.get("id") or "").strip(),
            "name": str(server.get("name") or "").strip(),
            "server_type": server_type,
            "url": url,
            "enabled": bool(server.get("enabled", True)),
            "output_dir": str(server.get("output_dir") or "./outputs").strip() or "./outputs",
            "api_key": api_key,
            "api_key_env": api_key_env,
            "use_api_key_for_partner_nodes": bool(server.get("use_api_key_for_partner_nodes", False)),
            "workflow_order": [
                str(workflow_id).strip()
                for workflow_id in server.get("workflow_order", [])
                if str(workflow_id).strip()
            ],
        }

    def list_bundled_cloud_templates(self, server_id: str | None = None) -> list[dict[str, Any]]:
        return list_bundled_templates(server_id)

    def list_official_cloud_templates(self, server_id: str | None = None) -> list[dict[str, Any]]:
        return fetch_official_blueprints(server_id)

    def get_official_cloud_template_detail(self, template_id: str) -> dict[str, Any]:
        return fetch_official_blueprint_detail(template_id)

    def install_default_bundled_templates(self, server_id: str, overwrite: bool = False) -> list[dict[str, Any]]:
        installed = []
        for template in list_bundled_templates():
            if not template.get("default_install"):
                continue
            try:
                installed.append(self.import_cloud_template(
                    server_id=server_id,
                    source="bundled",
                    template_id=str(template["id"]),
                    workflow_id=None,
                    overwrite_existing=overwrite,
                ))
            except FileExistsError:
                continue
        return installed

    def import_cloud_template(
        self,
        *,
        server_id: str,
        source: str,
        template_id: str,
        workflow_id: str | None,
        overwrite_existing: bool,
    ) -> dict[str, Any]:
        config = self.get_config()
        server = self._get_server_entry(config, server_id)
        if server is None:
            raise FileNotFoundError(f"Server '{server_id}' not found")
        if str(server.get("server_type") or DEFAULT_SERVER_TYPE) != COMFY_CLOUD_SERVER_TYPE:
            raise ValueError("Cloud templates can only be imported into Comfy Cloud servers")

        if source == "bundled":
            template, workflow_data, schema_data = load_bundled_template_files(template_id)
            target_workflow_id = workflow_id or template.workflow_id
            description = str(schema_data.get("description") or template.description).strip() or template.description
            schema_metadata = extract_schema_metadata(schema_data)
            schema_metadata.update(build_schema_metadata(
                origin=str(schema_metadata.get("origin") or template.origin),
                template_id=template_id,
                source_label=str(schema_metadata.get("source_label") or template.source_label),
                logical_workflow_id=str(schema_metadata.get("logical_workflow_id") or template.workflow_id or target_workflow_id),
                deployment_server_id=server_id,
                deployment_workflow_id=target_workflow_id,
                tags=schema_metadata.get("tags") or template.tags,
                server_type_hint=str(schema_metadata.get("server_type_hint") or COMFY_CLOUD_SERVER_TYPE),
                supports_direct_run=bool(schema_metadata.get("supports_direct_run", template.supports_direct_run)),
            ))
        elif source == "official":
            workflow_data, schema_data = load_supported_official_template(template_id)
            target_workflow_id = workflow_id or str(template_id).replace("_", "-")
            description = str(schema_data.get("description") or "").strip() or f"Official Cloud template import: {template_id}"
            schema_metadata = extract_schema_metadata(schema_data)
            schema_metadata.update(build_schema_metadata(
                origin=str(schema_metadata.get("origin") or "cloud_template"),
                template_id=template_id,
                source_label=str(schema_metadata.get("source_label") or "Comfy Cloud Blueprint"),
                logical_workflow_id=str(schema_metadata.get("logical_workflow_id") or template_id),
                deployment_server_id=server_id,
                deployment_workflow_id=target_workflow_id,
                tags=schema_metadata.get("tags") or ["official", "text-to-image"],
                server_type_hint=str(schema_metadata.get("server_type_hint") or COMFY_CLOUD_SERVER_TYPE),
                supports_direct_run=bool(schema_metadata.get("supports_direct_run", True)),
            ))
        else:
            raise ValueError("Unsupported cloud template source")

        schema = self.save_workflow(
            server_id=server_id,
            workflow_id=target_workflow_id,
            original_workflow_id=None,
            overwrite_existing=overwrite_existing,
            description=description,
            workflow_data=workflow_data,
            schema_params=schema_data.get("parameters", {}),
            ui_schema_params=schema_data.get("ui_parameters"),
            schema_metadata=schema_metadata,
        )

        return {
            "imported": True,
            "workflow_id": target_workflow_id,
            "origin": schema.get("origin") or "local_upload",
            "source_label": schema.get("source_label") or "Local Upload",
            "tags": schema.get("tags") or [],
            "supports_direct_run": bool(schema.get("supports_direct_run", True)),
            "suggested_test_args": build_suggested_test_args(schema),
        }

    @staticmethod
    def _serialize_server_for_ui(server: dict[str, Any]) -> dict[str, Any]:
        payload = dict(server)
        payload.pop("api_key", None)
        payload["has_api_key"] = bool(str(server.get("api_key") or "").strip())
        return payload
