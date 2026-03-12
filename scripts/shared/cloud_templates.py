from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from shared.config import (
    BUNDLED_CLOUD_TEMPLATES_DIR,
    COMFY_CLOUD_SERVER_TYPE,
    DEFAULT_COMFY_CLOUD_URL,
    get_server_schema_path,
    list_server_workflow_dirs,
)
from shared.json_utils import load_json

BUNDLED_CLOUD_TEMPLATES_MANIFEST = BUNDLED_CLOUD_TEMPLATES_DIR / "manifest.json"

SCHEMA_METADATA_KEYS = (
    "origin",
    "template_id",
    "source_label",
    "server_type_hint",
    "tags",
    "supports_direct_run",
    "logical_workflow_id",
    "deployment_server_id",
    "deployment_workflow_id",
)


class CloudTemplateError(RuntimeError):
    pass


@dataclass(slots=True)
class BundledTemplate:
    template_id: str
    workflow_id: str
    name: str
    description: str
    workflow_file: str
    schema_file: str
    tags: list[str]
    origin: str
    source_label: str
    server_type_hint: str
    supports_direct_run: bool
    default_install: bool

    def to_summary(self) -> dict[str, Any]:
        return {
            "id": self.template_id,
            "workflow_id": self.workflow_id,
            "name": self.name,
            "description": self.description,
            "tags": self.tags,
            "origin": self.origin,
            "source_label": self.source_label,
            "server_type_hint": self.server_type_hint,
            "supports_direct_run": self.supports_direct_run,
            "default_install": self.default_install,
        }


def load_bundled_manifest() -> list[BundledTemplate]:
    manifest = load_json(BUNDLED_CLOUD_TEMPLATES_MANIFEST)
    if not isinstance(manifest, dict):
        raise CloudTemplateError("Bundled cloud template manifest is invalid")

    entries = manifest.get("templates", [])
    if not isinstance(entries, list):
        raise CloudTemplateError("Bundled cloud template manifest must contain a templates list")

    templates: list[BundledTemplate] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise CloudTemplateError("Bundled cloud template manifest contains a non-object entry")
        templates.append(BundledTemplate(
            template_id=str(entry.get("id") or "").strip(),
            workflow_id=str(entry.get("workflow_id") or entry.get("id") or "").strip(),
            name=str(entry.get("name") or "").strip(),
            description=str(entry.get("description") or "").strip(),
            workflow_file=str(entry.get("workflow_file") or "").strip(),
            schema_file=str(entry.get("schema_file") or "").strip(),
            tags=[str(tag).strip() for tag in entry.get("tags", []) if str(tag).strip()],
            origin=str(entry.get("origin") or "bundled_cloud").strip() or "bundled_cloud",
            source_label=str(entry.get("source_label") or "Bundled Cloud").strip() or "Bundled Cloud",
            server_type_hint=str(entry.get("server_type_hint") or COMFY_CLOUD_SERVER_TYPE).strip() or COMFY_CLOUD_SERVER_TYPE,
            supports_direct_run=bool(entry.get("supports_direct_run", True)),
            default_install=bool(entry.get("default_install", entry.get("recommended", False))),
        ))
    return templates


def get_bundled_template(template_id: str) -> BundledTemplate:
    for template in load_bundled_manifest():
        if template.template_id == template_id:
            return template
    raise CloudTemplateError(f"Bundled template '{template_id}' was not found")


def load_bundled_template_files(template_id: str) -> tuple[BundledTemplate, dict[str, Any], dict[str, Any]]:
    template = get_bundled_template(template_id)
    workflow_path = BUNDLED_CLOUD_TEMPLATES_DIR / template.workflow_file
    schema_path = BUNDLED_CLOUD_TEMPLATES_DIR / template.schema_file
    workflow_data = load_json(workflow_path)
    schema_data = load_json(schema_path)
    if not isinstance(workflow_data, dict):
        raise CloudTemplateError(f"Bundled workflow '{workflow_path.name}' is invalid")
    if not isinstance(schema_data, dict):
        raise CloudTemplateError(f"Bundled schema '{schema_path.name}' is invalid")
    return template, workflow_data, schema_data


def build_schema_metadata(
    *,
    origin: str,
    template_id: str,
    source_label: str,
    logical_workflow_id: str,
    deployment_server_id: str = "",
    deployment_workflow_id: str = "",
    tags: list[str] | None = None,
    server_type_hint: str = COMFY_CLOUD_SERVER_TYPE,
    supports_direct_run: bool = True,
) -> dict[str, Any]:
    return {
        "origin": origin,
        "template_id": template_id,
        "source_label": source_label,
        "server_type_hint": server_type_hint,
        "tags": list(tags or []),
        "supports_direct_run": supports_direct_run,
        "logical_workflow_id": logical_workflow_id,
        "deployment_server_id": deployment_server_id,
        "deployment_workflow_id": deployment_workflow_id,
    }


def extract_schema_metadata(schema_data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: schema_data[key]
        for key in SCHEMA_METADATA_KEYS
        if key in schema_data
    }


def build_suggested_test_args(schema_data: dict[str, Any]) -> dict[str, Any]:
    parameters = schema_data.get("parameters", {})
    if not isinstance(parameters, dict):
        return {}

    test_args: dict[str, Any] = {}
    for param_name, param_info in parameters.items():
        if not isinstance(param_info, dict):
            continue

        normalized_name = str(param_name).strip().lower()
        default_value = param_info.get("default")
        example_value = param_info.get("example")

        if normalized_name in {"prompt", "text"} and isinstance(example_value, str) and example_value.strip():
            test_args[str(param_name)] = example_value
            continue

        if "default" in param_info:
            if default_value != "" or "example" not in param_info:
                test_args[str(param_name)] = default_value
                continue
        if "example" in param_info:
            test_args[str(param_name)] = example_value
            continue

        param_type = str(param_info.get("type") or "string").strip().lower()

        if normalized_name == "prompt":
            test_args[str(param_name)] = "a cinematic mountain landscape at sunrise, highly detailed"
        elif normalized_name == "negative_prompt":
            test_args[str(param_name)] = ""
        elif normalized_name == "seed":
            test_args[str(param_name)] = 20260311
        elif param_type == "boolean":
            test_args[str(param_name)] = False
        elif param_type == "int":
            test_args[str(param_name)] = 1
        elif param_type == "float":
            test_args[str(param_name)] = 1.0
        else:
            test_args[str(param_name)] = ""

    return test_args


def get_installed_template_state(server_id: str) -> dict[tuple[str, str], str]:
    installed: dict[tuple[str, str], str] = {}
    for workflow_dir in list_server_workflow_dirs(server_id):
        schema_path = get_server_schema_path(server_id, workflow_dir.name)
        try:
            schema_data = load_json(schema_path)
        except Exception:
            continue
        if not isinstance(schema_data, dict):
            continue

        origin = str(schema_data.get("origin") or "").strip()
        template_id = str(schema_data.get("template_id") or "").strip()
        workflow_id = str(schema_data.get("deployment_workflow_id") or schema_data.get("workflow_id") or workflow_dir.name).strip()
        if origin and template_id and workflow_id:
            installed[(origin, template_id)] = workflow_id
    return installed


def list_bundled_templates(server_id: str | None = None) -> list[dict[str, Any]]:
    installed = get_installed_template_state(server_id) if server_id else {}
    templates = []
    for template in load_bundled_manifest():
        payload = template.to_summary()
        installed_workflow_id = installed.get((template.origin, template.template_id))
        if installed_workflow_id:
            payload["installed"] = True
            payload["installed_workflow_id"] = installed_workflow_id
        else:
            payload["installed"] = False
        templates.append(payload)
    return templates


def fetch_official_blueprints(server_id: str | None = None, base_url: str = DEFAULT_COMFY_CLOUD_URL) -> list[dict[str, Any]]:
    response = requests.get(f"{base_url.rstrip('/')}/api/global_subgraphs", timeout=30)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise CloudTemplateError("Cloud blueprint list response is invalid")

    installed = get_installed_template_state(server_id) if server_id else {}
    templates = []
    for template_id, info in sorted(payload.items(), key=lambda item: str(item[1].get("name") or item[0]).lower()):
        info = info if isinstance(info, dict) else {}
        item = {
            "id": str(template_id),
            "name": str(info.get("name") or template_id),
            "description": "Official Comfy Cloud blueprint. Only curated blueprints can be imported as runnable starter workflows.",
            "tags": ["official", "blueprint"],
            "origin": "cloud_template",
            "source_label": "Comfy Cloud Blueprint",
            "server_type_hint": COMFY_CLOUD_SERVER_TYPE,
            "supports_direct_run": str(template_id) in get_supported_official_template_ids(),
            "default_install": False,
            "source": str(info.get("source") or ""),
            "info": info.get("info") or {},
        }
        installed_workflow_id = installed.get(("cloud_template", str(template_id)))
        if installed_workflow_id:
            item["installed"] = True
            item["installed_workflow_id"] = installed_workflow_id
        else:
            item["installed"] = False
        templates.append(item)
    return templates


def fetch_official_blueprint_detail(template_id: str, base_url: str = DEFAULT_COMFY_CLOUD_URL) -> dict[str, Any]:
    response = requests.get(f"{base_url.rstrip('/')}/api/global_subgraphs/{template_id}", timeout=30)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise CloudTemplateError("Cloud blueprint detail response is invalid")

    raw_data = str(payload.get("data") or "")
    parsed_data: dict[str, Any] | list[Any] | None
    try:
        parsed_data = json.loads(raw_data) if raw_data else None
    except json.JSONDecodeError:
        parsed_data = None

    return {
        "id": str(template_id),
        "name": str(payload.get("name") or template_id),
        "description": "Official Comfy Cloud blueprint. Only curated blueprints can be imported as runnable starter workflows.",
        "tags": ["official", "blueprint"],
        "origin": "cloud_template",
        "source_label": "Comfy Cloud Blueprint",
        "server_type_hint": COMFY_CLOUD_SERVER_TYPE,
        "supports_direct_run": str(template_id) in get_supported_official_template_ids(),
        "source": str(payload.get("source") or ""),
        "info": payload.get("info") or {},
        "raw_data": raw_data,
        "parsed_data": parsed_data,
    }


def get_supported_official_template_ids() -> set[str]:
    # Global subgraph blueprints are not directly executable API-format workflows.
    # We only enable direct import for templates that we curate into runnable workflows.
    return {"text_to_image"}


def load_supported_official_template(template_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if template_id != "text_to_image":
        raise CloudTemplateError(
            f"Official template '{template_id}' is discoverable but not yet supported for direct runnable import"
        )

    _, workflow_data, schema_data = load_bundled_template_files("text_to_image_square")
    schema_copy = json.loads(json.dumps(schema_data))
    workflow_copy = json.loads(json.dumps(workflow_data))
    schema_copy.update(build_schema_metadata(
        origin="cloud_template",
        template_id=template_id,
        source_label="Comfy Cloud Blueprint",
        logical_workflow_id=template_id,
        tags=["official", "text-to-image"],
        supports_direct_run=True,
    ))
    schema_copy["description"] = "Curated runnable import aligned with the official Comfy Cloud 'Text to Image' blueprint."
    return workflow_copy, schema_copy
