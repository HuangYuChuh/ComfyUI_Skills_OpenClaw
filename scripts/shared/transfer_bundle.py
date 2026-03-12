from __future__ import annotations

import copy
import json
import os
import uuid
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from shared.config import (
    BASE_DIR,
    CONFIG_PATH,
    DEFAULT_COMFYUI_SERVER_URL,
    DEFAULT_OUTPUT_DIR,
    default_config,
    get_server_data_dir,
    get_server_schema_path,
    get_server_workflow_path,
    list_server_workflow_dirs,
)
from shared.json_utils import load_json
from shared.runtime_config import get_runtime_config

BUNDLE_VERSION = 1
BUNDLE_TYPE = "openclaw-comfyui-skill"
LOCK_PATH = BASE_DIR / ".transfer.lock"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _is_valid_identifier(value: str) -> bool:
    if not value:
        return False
    if value in {".", ".."}:
        return False
    if any(separator in value for separator in ("/", "\\", " ")):
        return False
    return True


def _normalize_identifier(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _safe_load_json(path: Path) -> dict[str, Any] | None:
    try:
        loaded = load_json(path)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(loaded, dict):
        return None
    return loaded


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temp_path.replace(path)


def _list_workflow_file_ids(server_id: str) -> tuple[set[str], set[str]]:
    workflow_ids: set[str] = set()
    schema_ids: set[str] = set()
    for workflow_dir in list_server_workflow_dirs(server_id):
        workflow_id = workflow_dir.name
        if get_server_workflow_path(server_id, workflow_id).exists():
            workflow_ids.add(workflow_id)
        if get_server_schema_path(server_id, workflow_id).exists():
            schema_ids.add(workflow_id)
    return workflow_ids, schema_ids


@contextmanager
def acquire_transfer_lock():
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd: int | None = None
    created = False
    try:
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        created = True
        os.write(fd, f"{os.getpid()}\n".encode("utf-8"))
        yield
    except FileExistsError as exc:
        raise RuntimeError("Another import/export operation is already running.") from exc
    finally:
        if fd is not None:
            os.close(fd)
        if created and LOCK_PATH.exists():
            LOCK_PATH.unlink()


@dataclass(slots=True)
class ValidationIssue:
    code: str
    message: str
    context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ValidationResult:
    valid: bool
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "errors": [issue.to_dict() for issue in self.errors],
            "warnings": [issue.to_dict() for issue in self.warnings],
        }


@dataclass(slots=True)
class PlanItem:
    server_id: str
    workflow_id: str | None = None
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ImportPlan:
    created_servers: list[PlanItem] = field(default_factory=list)
    updated_servers: list[PlanItem] = field(default_factory=list)
    created_workflows: list[PlanItem] = field(default_factory=list)
    overwritten_workflows: list[PlanItem] = field(default_factory=list)
    skipped_items: list[PlanItem] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)
    apply_environment: bool = False
    overwrite_workflows: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "created_servers": [item.to_dict() for item in self.created_servers],
            "updated_servers": [item.to_dict() for item in self.updated_servers],
            "created_workflows": [item.to_dict() for item in self.created_workflows],
            "overwritten_workflows": [item.to_dict() for item in self.overwritten_workflows],
            "skipped_items": [item.to_dict() for item in self.skipped_items],
            "warnings": [issue.to_dict() for issue in self.warnings],
            "apply_environment": self.apply_environment,
            "overwrite_workflows": self.overwrite_workflows,
            "summary": {
                "created_servers": len(self.created_servers),
                "updated_servers": len(self.updated_servers),
                "created_workflows": len(self.created_workflows),
                "overwritten_workflows": len(self.overwritten_workflows),
                "skipped_items": len(self.skipped_items),
                "warnings": len(self.warnings),
            },
        }


@dataclass(slots=True)
class ImportPreview:
    validation: ValidationResult
    plan: ImportPlan | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "validation": self.validation.to_dict(),
            "plan": self.plan.to_dict() if self.plan else None,
        }


@dataclass(slots=True)
class ImportReport:
    validation: ValidationResult
    plan: ImportPlan

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "success",
            "validation": self.validation.to_dict(),
            "plan": self.plan.to_dict(),
        }


class BundleValidationError(ValueError):
    def __init__(self, result: ValidationResult):
        super().__init__("Bundle validation failed")
        self.result = result


def _normalize_export_selection(selection: dict[str, Any] | None) -> dict[str, set[str]]:
    if not isinstance(selection, dict):
        return {}

    selected_servers = selection.get("servers", [])
    if not isinstance(selected_servers, list):
        return {}

    normalized: dict[str, set[str]] = {}
    for server in selected_servers:
        if not isinstance(server, dict):
            continue
        server_id = _normalize_identifier(server.get("server_id"))
        if not _is_valid_identifier(server_id):
            continue
        workflow_ids = server.get("workflow_ids", [])
        if not isinstance(workflow_ids, list):
            workflow_ids = []
        normalized[server_id] = {
            workflow_id
            for workflow_id in (_normalize_identifier(item) for item in workflow_ids)
            if _is_valid_identifier(workflow_id)
        }
    return normalized


def _collect_export_inventory() -> tuple[list[dict[str, Any]], list[ValidationIssue], dict[str, Any]]:
    config = get_runtime_config()
    servers = config.get("servers", [])
    warnings: list[ValidationIssue] = []
    inventory: list[dict[str, Any]] = []

    for server in servers:
        if not isinstance(server, dict):
            warnings.append(ValidationIssue(
                code="invalid_server_config",
                message="Skipped invalid server config entry during export.",
            ))
            continue

        server_id = _normalize_identifier(server.get("id"))
        if not _is_valid_identifier(server_id):
            warnings.append(ValidationIssue(
                code="invalid_server_id",
                message="Skipped server with invalid id during export.",
                context={"server_id": server_id},
            ))
            continue

        server_entry = {
            "id": server_id,
            "name": _normalize_string(server.get("name"), default=server_id) or server_id,
            "enabled": bool(server.get("enabled", True)),
            "workflow_order": [
                workflow_id
                for workflow_id in (
                    _normalize_identifier(item)
                    for item in server.get("workflow_order", [])
                )
                if _is_valid_identifier(workflow_id)
            ],
            "runtime": {
                "url": _normalize_string(server.get("url"), default=DEFAULT_COMFYUI_SERVER_URL) or DEFAULT_COMFYUI_SERVER_URL,
                "output_dir": _normalize_string(server.get("output_dir"), default=DEFAULT_OUTPUT_DIR) or DEFAULT_OUTPUT_DIR,
            },
            "workflows": [],
        }

        workflow_ids, schema_ids = _list_workflow_file_ids(server_id)
        for missing_workflow in sorted(schema_ids - workflow_ids):
            warnings.append(ValidationIssue(
                code="missing_workflow_file",
                message="Skipped schema without matching workflow file during export.",
                context={"server_id": server_id, "workflow_id": missing_workflow},
            ))
        for missing_schema in sorted(workflow_ids - schema_ids):
            warnings.append(ValidationIssue(
                code="missing_schema_file",
                message="Skipped workflow without matching schema file during export.",
                context={"server_id": server_id, "workflow_id": missing_schema},
            ))

        for workflow_id in sorted(workflow_ids & schema_ids):
            workflow_path = get_server_workflow_path(server_id, workflow_id)
            schema_path = get_server_schema_path(server_id, workflow_id)
            workflow_data = _safe_load_json(workflow_path)
            schema_data = _safe_load_json(schema_path)

            if workflow_data is None or schema_data is None:
                warnings.append(ValidationIssue(
                    code="invalid_workflow_payload",
                    message="Skipped workflow with unreadable workflow or schema JSON during export.",
                    context={"server_id": server_id, "workflow_id": workflow_id},
                ))
                continue

            schema_payload = copy.deepcopy(schema_data)
            schema_payload.pop("workflow_id", None)
            server_entry["workflows"].append({
                "workflow_id": workflow_id,
                "workflow_data": workflow_data,
                "schema_data": schema_payload,
                "enabled": bool(schema_payload.get("enabled", True)),
                "description": _normalize_string(schema_payload.get("description")),
            })

        inventory.append(server_entry)

    return inventory, warnings, config


def summarize_export_bundle(bundle: dict[str, Any], warnings: list[ValidationIssue]) -> dict[str, Any]:
    portable = bundle.get("portable", {}) if isinstance(bundle, dict) else {}
    servers = portable.get("servers", []) if isinstance(portable, dict) else []
    workflows = portable.get("workflows", []) if isinstance(portable, dict) else []

    workflow_map: dict[str, list[dict[str, Any]]] = {}
    for workflow in workflows if isinstance(workflows, list) else []:
        if not isinstance(workflow, dict):
            continue
        server_id = _normalize_identifier(workflow.get("server_id"))
        workflow_map.setdefault(server_id, []).append({
            "workflow_id": _normalize_identifier(workflow.get("workflow_id")),
            "enabled": bool((workflow.get("schema_data") or {}).get("enabled", True)) if isinstance(workflow.get("schema_data"), dict) else True,
            "description": _normalize_string((workflow.get("schema_data") or {}).get("description", "")) if isinstance(workflow.get("schema_data"), dict) else "",
            "selected": True,
        })

    server_items = []
    for server in servers if isinstance(servers, list) else []:
        if not isinstance(server, dict):
            continue
        server_id = _normalize_identifier(server.get("id"))
        workflows_for_server = workflow_map.get(server_id, [])
        server_items.append({
            "server_id": server_id,
            "name": _normalize_string(server.get("name")),
            "enabled": bool(server.get("enabled", True)),
            "selected": True,
            "workflow_count": len(workflows_for_server),
            "workflows": sorted(workflows_for_server, key=lambda item: item["workflow_id"].lower()),
        })

    return {
        "portable_only": bool(bundle.get("meta", {}).get("portable_only", False)) if isinstance(bundle, dict) else False,
        "summary": {
            "servers": len(server_items),
            "workflows": sum(item["workflow_count"] for item in server_items),
            "warnings": len(warnings),
        },
        "servers": server_items,
        "warnings": [issue.to_dict() for issue in warnings],
    }


def build_export_bundle(
    portable_only: bool = False,
    selection: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[ValidationIssue]]:
    inventory, warnings, config = _collect_export_inventory()
    normalized_selection = _normalize_export_selection(selection)
    use_selection = bool(normalized_selection)
    portable_servers: list[dict[str, Any]] = []
    portable_workflows: list[dict[str, Any]] = []
    runtime_mapping: dict[str, dict[str, str]] = {}

    for server in inventory:
        server_id = server["id"]
        selected_workflow_ids = normalized_selection.get(server_id) if use_selection else None
        exported_workflows = []
        for workflow in server["workflows"]:
            workflow_id = workflow["workflow_id"]
            if use_selection and (selected_workflow_ids is None or workflow_id not in selected_workflow_ids):
                continue
            exported_workflows.append(workflow)

        if not exported_workflows:
            continue

        exported_workflow_id_set = {workflow["workflow_id"] for workflow in exported_workflows}
        portable_servers.append({
            "id": server_id,
            "name": server["name"],
            "enabled": server["enabled"],
            "workflow_order": [
                workflow_id
                for workflow_id in server["workflow_order"]
                if workflow_id in exported_workflow_id_set
            ],
        })
        runtime_mapping[server_id] = copy.deepcopy(server["runtime"])

        for workflow in exported_workflows:
            portable_workflows.append({
                "server_id": server_id,
                "workflow_id": workflow["workflow_id"],
                "workflow_data": copy.deepcopy(workflow["workflow_data"]),
                "schema_data": copy.deepcopy(workflow["schema_data"]),
            })

    bundle: dict[str, Any] = {
        "bundle_version": BUNDLE_VERSION,
        "bundle_type": BUNDLE_TYPE,
        "exported_at": _utc_now_iso(),
        "meta": {
            "generator": "ComfyUI_Skills_OpenClaw",
            "generator_version": "local",
            "portable_only": portable_only,
            "partial_export": use_selection,
        },
        "portable": {
            "servers": portable_servers,
            "workflows": portable_workflows,
        },
    }

    if not portable_only:
        default_server = _normalize_identifier(config.get("default_server"))
        bundle["environment"] = {
            "default_server": default_server if default_server in runtime_mapping else "",
            "server_runtime": runtime_mapping,
        }

    return bundle, warnings


def validate_bundle(bundle: dict[str, Any]) -> ValidationResult:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    if not isinstance(bundle, dict):
        return ValidationResult(
            valid=False,
            errors=[ValidationIssue(code="invalid_bundle", message="Bundle payload must be a JSON object.")],
        )

    if bundle.get("bundle_type") != BUNDLE_TYPE:
        errors.append(ValidationIssue(
            code="invalid_bundle_type",
            message="Unsupported bundle type.",
            context={"bundle_type": bundle.get("bundle_type")},
        ))

    if bundle.get("bundle_version") != BUNDLE_VERSION:
        errors.append(ValidationIssue(
            code="unsupported_bundle_version",
            message="Unsupported bundle version.",
            context={"bundle_version": bundle.get("bundle_version")},
        ))

    portable = bundle.get("portable")
    if not isinstance(portable, dict):
        errors.append(ValidationIssue(code="missing_portable", message="Bundle is missing portable data."))
        return ValidationResult(valid=False, errors=errors, warnings=warnings)

    servers = portable.get("servers")
    workflows = portable.get("workflows")

    if not isinstance(servers, list):
        errors.append(ValidationIssue(code="invalid_servers", message="portable.servers must be a list."))
        servers = []
    if not isinstance(workflows, list):
        errors.append(ValidationIssue(code="invalid_workflows", message="portable.workflows must be a list."))
        workflows = []

    seen_servers: set[str] = set()
    for index, server in enumerate(servers):
        if not isinstance(server, dict):
            errors.append(ValidationIssue(
                code="invalid_server_entry",
                message="Server entry must be an object.",
                context={"index": index},
            ))
            continue

        server_id = _normalize_identifier(server.get("id"))
        if not _is_valid_identifier(server_id):
            errors.append(ValidationIssue(
                code="invalid_server_id",
                message="Server id is invalid.",
                context={"index": index, "server_id": server_id},
            ))
            continue
        if server_id in seen_servers:
            errors.append(ValidationIssue(
                code="duplicate_server_id",
                message="Duplicate server id found in bundle.",
                context={"server_id": server_id},
            ))
        seen_servers.add(server_id)

        workflow_order = server.get("workflow_order", [])
        if workflow_order is not None and not isinstance(workflow_order, list):
            errors.append(ValidationIssue(
                code="invalid_workflow_order",
                message="workflow_order must be a list.",
                context={"server_id": server_id},
            ))
        elif isinstance(workflow_order, list):
            invalid_ids = [
                workflow_id
                for workflow_id in (_normalize_identifier(item) for item in workflow_order)
                if workflow_id and not _is_valid_identifier(workflow_id)
            ]
            if invalid_ids:
                warnings.append(ValidationIssue(
                    code="invalid_workflow_order_ids",
                    message="Some workflow ids in workflow_order are invalid and will be ignored.",
                    context={"server_id": server_id, "workflow_ids": invalid_ids},
                ))

    seen_workflows: set[tuple[str, str]] = set()
    for index, workflow in enumerate(workflows):
        if not isinstance(workflow, dict):
            errors.append(ValidationIssue(
                code="invalid_workflow_entry",
                message="Workflow entry must be an object.",
                context={"index": index},
            ))
            continue

        server_id = _normalize_identifier(workflow.get("server_id"))
        workflow_id = _normalize_identifier(workflow.get("workflow_id"))
        if not _is_valid_identifier(server_id):
            errors.append(ValidationIssue(
                code="invalid_workflow_server_id",
                message="Workflow server id is invalid.",
                context={"index": index, "server_id": server_id},
            ))
            continue
        if not _is_valid_identifier(workflow_id):
            errors.append(ValidationIssue(
                code="invalid_workflow_id",
                message="Workflow id is invalid.",
                context={"index": index, "workflow_id": workflow_id},
            ))
            continue
        if server_id not in seen_servers:
            errors.append(ValidationIssue(
                code="workflow_server_missing",
                message="Workflow references a server that is not present in portable.servers.",
                context={"server_id": server_id, "workflow_id": workflow_id},
            ))
            continue

        composite_id = (server_id, workflow_id)
        if composite_id in seen_workflows:
            errors.append(ValidationIssue(
                code="duplicate_workflow_id",
                message="Duplicate workflow entry found in bundle.",
                context={"server_id": server_id, "workflow_id": workflow_id},
            ))
            continue
        seen_workflows.add(composite_id)

        workflow_data = workflow.get("workflow_data")
        schema_data = workflow.get("schema_data")
        if not isinstance(workflow_data, dict):
            errors.append(ValidationIssue(
                code="invalid_workflow_data",
                message="workflow_data must be an object.",
                context={"server_id": server_id, "workflow_id": workflow_id},
            ))
        if not isinstance(schema_data, dict):
            errors.append(ValidationIssue(
                code="invalid_schema_data",
                message="schema_data must be an object.",
                context={"server_id": server_id, "workflow_id": workflow_id},
            ))

    environment = bundle.get("environment")
    if environment is not None and not isinstance(environment, dict):
        warnings.append(ValidationIssue(
            code="invalid_environment",
            message="environment must be an object when provided.",
        ))

    return ValidationResult(valid=not errors, errors=errors, warnings=warnings)


def preview_bundle_import(
    bundle: dict[str, Any],
    *,
    apply_environment: bool = False,
    overwrite_workflows: bool = True,
) -> ImportPreview:
    validation = validate_bundle(bundle)
    if not validation.valid:
        return ImportPreview(validation=validation, plan=None)

    config = get_runtime_config()
    existing_servers = {
        _normalize_identifier(server.get("id")): server
        for server in config.get("servers", [])
        if isinstance(server, dict) and _is_valid_identifier(_normalize_identifier(server.get("id")))
    }

    portable = bundle["portable"]
    bundle_servers = {
        _normalize_identifier(server.get("id")): server
        for server in portable.get("servers", [])
        if isinstance(server, dict)
    }

    plan = ImportPlan(
        warnings=list(validation.warnings),
        apply_environment=apply_environment,
        overwrite_workflows=overwrite_workflows,
    )

    for server_id in sorted(bundle_servers):
        if server_id in existing_servers:
            plan.updated_servers.append(PlanItem(server_id=server_id, reason="merge_server"))
        else:
            plan.created_servers.append(PlanItem(server_id=server_id, reason="create_server"))

    for workflow in portable.get("workflows", []):
        server_id = _normalize_identifier(workflow.get("server_id"))
        workflow_id = _normalize_identifier(workflow.get("workflow_id"))
        workflow_path = get_server_workflow_path(server_id, workflow_id)
        schema_path = get_server_schema_path(server_id, workflow_id)
        exists = workflow_path.exists() or schema_path.exists()
        if exists and not overwrite_workflows:
            plan.skipped_items.append(PlanItem(
                server_id=server_id,
                workflow_id=workflow_id,
                reason="workflow_exists",
            ))
            continue
        if exists:
            plan.overwritten_workflows.append(PlanItem(
                server_id=server_id,
                workflow_id=workflow_id,
                reason="overwrite_workflow",
            ))
        else:
            plan.created_workflows.append(PlanItem(
                server_id=server_id,
                workflow_id=workflow_id,
                reason="create_workflow",
            ))

    return ImportPreview(validation=validation, plan=plan)


def _merge_workflow_order(
    existing_order: list[str],
    bundle_order: list[str],
    imported_workflow_ids: set[str],
    existing_file_ids: set[str],
) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()

    for workflow_id in bundle_order:
        if workflow_id in imported_workflow_ids and workflow_id not in seen:
            merged.append(workflow_id)
            seen.add(workflow_id)

    for workflow_id in existing_order:
        if workflow_id in existing_file_ids and workflow_id not in seen:
            merged.append(workflow_id)
            seen.add(workflow_id)

    for workflow_id in sorted(existing_file_ids):
        if workflow_id not in seen:
            merged.append(workflow_id)
            seen.add(workflow_id)

    return merged


def apply_bundle_import(
    bundle: dict[str, Any],
    *,
    apply_environment: bool = False,
    overwrite_workflows: bool = True,
) -> ImportReport:
    preview = preview_bundle_import(
        bundle,
        apply_environment=apply_environment,
        overwrite_workflows=overwrite_workflows,
    )
    if not preview.validation.valid or preview.plan is None:
        raise BundleValidationError(preview.validation)

    portable = bundle["portable"]
    environment = bundle.get("environment", {})

    with acquire_transfer_lock():
        config = get_runtime_config()
        if not isinstance(config, dict) or "servers" not in config:
            config = default_config()

        servers = config.get("servers", [])
        if not isinstance(servers, list):
            servers = []
            config["servers"] = servers

        server_map: dict[str, dict[str, Any]] = {}
        for server in servers:
            if not isinstance(server, dict):
                continue
            server_id = _normalize_identifier(server.get("id"))
            if _is_valid_identifier(server_id):
                server_map[server_id] = server

        runtime_data = environment.get("server_runtime", {}) if isinstance(environment, dict) else {}
        if not isinstance(runtime_data, dict):
            runtime_data = {}

        imported_workflow_ids_by_server: dict[str, set[str]] = {}
        bundle_server_data: dict[str, dict[str, Any]] = {}

        for bundle_server in portable.get("servers", []):
            server_id = _normalize_identifier(bundle_server.get("id"))
            if not _is_valid_identifier(server_id):
                continue

            bundle_server_data[server_id] = bundle_server
            target = server_map.get(server_id)
            if target is None:
                target = {
                    "id": server_id,
                    "name": _normalize_string(bundle_server.get("name"), default=server_id) or server_id,
                    "url": DEFAULT_COMFYUI_SERVER_URL,
                    "enabled": bool(bundle_server.get("enabled", True)),
                    "output_dir": DEFAULT_OUTPUT_DIR,
                    "workflow_order": [],
                }
                servers.append(target)
                server_map[server_id] = target
            else:
                target["name"] = _normalize_string(bundle_server.get("name"), default=target.get("name", server_id)) or target.get("name", server_id)
                target["enabled"] = bool(bundle_server.get("enabled", True))

            if apply_environment:
                runtime_entry = runtime_data.get(server_id)
                if isinstance(runtime_entry, dict):
                    url = _normalize_string(runtime_entry.get("url"))
                    output_dir = _normalize_string(runtime_entry.get("output_dir"))
                    if url:
                        target["url"] = url
                    if output_dir:
                        target["output_dir"] = output_dir

            get_server_data_dir(server_id).mkdir(parents=True, exist_ok=True)

        planned_overwrites = {
            (item.server_id, item.workflow_id)
            for item in preview.plan.overwritten_workflows
            if item.workflow_id
        }
        planned_creates = {
            (item.server_id, item.workflow_id)
            for item in preview.plan.created_workflows
            if item.workflow_id
        }

        for workflow in portable.get("workflows", []):
            server_id = _normalize_identifier(workflow.get("server_id"))
            workflow_id = _normalize_identifier(workflow.get("workflow_id"))
            composite_id = (server_id, workflow_id)
            if composite_id not in planned_overwrites and composite_id not in planned_creates:
                continue

            workflow_payload = copy.deepcopy(workflow.get("workflow_data", {}))
            schema_payload = copy.deepcopy(workflow.get("schema_data", {}))
            schema_payload.pop("workflow_id", None)

            workflow_path = get_server_workflow_path(server_id, workflow_id)
            schema_path = get_server_schema_path(server_id, workflow_id)
            _atomic_write_json(workflow_path, workflow_payload)
            _atomic_write_json(schema_path, schema_payload)

            imported_workflow_ids_by_server.setdefault(server_id, set()).add(workflow_id)

        for server_id, server in server_map.items():
            bundle_server = bundle_server_data.get(server_id)
            if bundle_server is None:
                continue

            existing_workflow_ids, existing_schema_ids = _list_workflow_file_ids(server_id)
            existing_file_ids = existing_workflow_ids & existing_schema_ids
            existing_order = [
                workflow_id
                for workflow_id in (
                    _normalize_identifier(item)
                    for item in server.get("workflow_order", [])
                )
                if _is_valid_identifier(workflow_id)
            ]
            bundle_order = [
                workflow_id
                for workflow_id in (
                    _normalize_identifier(item)
                    for item in bundle_server.get("workflow_order", [])
                )
                if _is_valid_identifier(workflow_id)
            ]
            imported_ids = imported_workflow_ids_by_server.get(server_id, set())
            server["workflow_order"] = _merge_workflow_order(
                existing_order=existing_order,
                bundle_order=bundle_order,
                imported_workflow_ids=imported_ids,
                existing_file_ids=existing_file_ids,
            )

        if apply_environment and isinstance(environment, dict):
            default_server = _normalize_identifier(environment.get("default_server"))
            if default_server and default_server in server_map:
                config["default_server"] = default_server

        config["servers"] = servers
        _atomic_write_json(CONFIG_PATH, config)

    return ImportReport(validation=preview.validation, plan=preview.plan)
