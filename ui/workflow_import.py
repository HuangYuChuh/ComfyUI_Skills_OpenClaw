from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import TYPE_CHECKING, Any

import requests

try:
    from .comfyui_userdata import ComfyUIClientError, ComfyUIServerAPI
    from .workflow_format import (
        EditorWorkflowConverter,
        WorkflowImportError,
        build_final_schema,
        extract_schema_params,
        is_api_workflow,
        is_editor_workflow,
        normalize_string,
        suggest_workflow_id,
    )
except ImportError:
    from comfyui_userdata import ComfyUIClientError, ComfyUIServerAPI
    from workflow_format import (
        EditorWorkflowConverter,
        WorkflowImportError,
        build_final_schema,
        extract_schema_params,
        is_api_workflow,
        is_editor_workflow,
        normalize_string,
        suggest_workflow_id,
    )

if TYPE_CHECKING:
    from .services import UIStorageService


@dataclass(slots=True)
class BulkImportItem:
    workflow_id: str
    final_workflow_id: str
    source_label: str
    status: str
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "final_workflow_id": self.final_workflow_id,
            "source_label": self.source_label,
            "status": self.status,
            "reason": self.reason,
        }


@dataclass(slots=True)
class BulkImportReport:
    items: list[BulkImportItem] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        summary = {
            "created": sum(1 for item in self.items if item.status == "created"),
            "renamed": sum(1 for item in self.items if item.status == "renamed"),
            "skipped": sum(1 for item in self.items if item.status == "skipped"),
            "failed": sum(1 for item in self.items if item.status == "failed"),
            "total": len(self.items),
        }
        return {
            "summary": summary,
            "items": [item.to_dict() for item in self.items],
        }


@dataclass(slots=True)
class BulkImportPreviewItem:
    workflow_id: str
    final_workflow_id: str
    source_label: str
    description: str
    status: str
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "final_workflow_id": self.final_workflow_id,
            "source_label": self.source_label,
            "description": self.description,
            "status": self.status,
            "reason": self.reason,
        }


@dataclass(slots=True)
class BulkImportPreviewReport:
    items: list[BulkImportPreviewItem] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        summary = {
            "ready": sum(1 for item in self.items if item.status == "ready"),
            "renamed": sum(1 for item in self.items if item.status == "renamed"),
            "failed": sum(1 for item in self.items if item.status == "failed"),
            "importable": sum(1 for item in self.items if item.status in {"ready", "renamed"}),
            "total": len(self.items),
        }
        return {
            "summary": summary,
            "items": [item.to_dict() for item in self.items],
        }


class WorkflowBulkImporter:
    def __init__(self, service: UIStorageService, server_id: str):
        self.service = service
        self.server_id = server_id
        self._config_server = self._get_server_entry()
        self._object_info: dict[str, Any] | None = None

    def import_local_files(self, files: list[dict[str, str]]) -> BulkImportReport:
        report = BulkImportReport()
        reserved_ids: set[str] = set()

        for item in files:
            file_name = normalize_string(item.get("file_name"), "workflow.json")
            content = item.get("content")
            source_label = file_name or "workflow.json"
            if not isinstance(content, str) or not content.strip():
                report.items.append(BulkImportItem("", "", source_label, "failed", "File content is empty."))
                continue

            try:
                workflow_data = json.loads(content)
            except json.JSONDecodeError:
                report.items.append(BulkImportItem("", "", source_label, "failed", "Invalid JSON file."))
                continue

            report.items.append(
                self._import_one(
                    workflow_data=workflow_data,
                    source_label=source_label,
                    origin="local_batch",
                    reserved_ids=reserved_ids,
                    file_name=file_name,
                ),
            )

        return report

    def import_from_comfyui(self) -> BulkImportReport:
        api = self._build_server_api()
        workflow_paths = api.list_workflow_paths()
        report = BulkImportReport()
        reserved_ids: set[str] = set()

        if not workflow_paths:
            report.items.append(BulkImportItem("", "", "workflows", "skipped", "No saved workflow JSON files were found on the ComfyUI server."))
            return report

        for workflow_path in workflow_paths:
            try:
                workflow_data = api.read_workflow_json(workflow_path)
            except ComfyUIClientError as exc:
                report.items.append(BulkImportItem("", "", workflow_path, "failed", str(exc)))
                continue

            report.items.append(
                self._import_one(
                    workflow_data=workflow_data,
                    source_label=workflow_path,
                    origin="comfyui_server",
                    reserved_ids=reserved_ids,
                    file_name=PurePosixPath(workflow_path).name,
                ),
            )

        return report

    def preview_from_comfyui(self) -> BulkImportPreviewReport:
        api = self._build_server_api()
        workflow_paths = api.list_workflow_paths()
        report = BulkImportPreviewReport()
        reserved_ids: set[str] = set()

        for workflow_path in workflow_paths:
            try:
                workflow_data = api.read_workflow_json(workflow_path)
            except ComfyUIClientError as exc:
                report.items.append(BulkImportPreviewItem("", "", workflow_path, "", "failed", str(exc)))
                continue

            report.items.append(
                self._preview_one(
                    workflow_data=workflow_data,
                    source_label=workflow_path,
                    reserved_ids=reserved_ids,
                    file_name=PurePosixPath(workflow_path).name,
                ),
            )

        return report

    def _import_one(
        self,
        workflow_data: Any,
        source_label: str,
        origin: str,
        reserved_ids: set[str],
        file_name: str = "",
    ) -> BulkImportItem:
        if not isinstance(workflow_data, dict):
            return BulkImportItem("", "", source_label, "failed", "Workflow JSON must be an object.")

        try:
            normalized_workflow = self._normalize_workflow_payload(workflow_data)
            suggested_id = suggest_workflow_id(normalized_workflow, file_name)
            final_workflow_id = self.service.next_available_workflow_id(self.server_id, suggested_id, reserved_ids)
            reserved_ids.add(final_workflow_id)
            self._save_imported_workflow(
                original_workflow=workflow_data,
                normalized_workflow=normalized_workflow,
                workflow_id=final_workflow_id,
                origin=origin,
                source_label=source_label,
            )
            status = "created" if final_workflow_id == suggested_id else "renamed"
            return BulkImportItem(suggested_id, final_workflow_id, source_label, status)
        except (WorkflowImportError, FileExistsError, ValueError) as exc:
            return BulkImportItem("", "", source_label, "failed", str(exc))

    def _preview_one(
        self,
        workflow_data: Any,
        source_label: str,
        reserved_ids: set[str],
        file_name: str = "",
    ) -> BulkImportPreviewItem:
        if not isinstance(workflow_data, dict):
            return BulkImportPreviewItem("", "", source_label, "", "failed", "Workflow JSON must be an object.")

        try:
            normalized_workflow = self._normalize_workflow_payload(workflow_data)
            suggested_id = suggest_workflow_id(normalized_workflow, file_name)
            final_workflow_id = self.service.next_available_workflow_id(self.server_id, suggested_id, reserved_ids)
            reserved_ids.add(final_workflow_id)
            status = "ready" if final_workflow_id == suggested_id else "renamed"
            return BulkImportPreviewItem(
                suggested_id,
                final_workflow_id,
                source_label,
                self._suggest_description(workflow_data, normalized_workflow, source_label),
                status,
            )
        except (WorkflowImportError, FileExistsError, ValueError) as exc:
            return BulkImportPreviewItem("", "", source_label, "", "failed", str(exc))

    def _save_imported_workflow(
        self,
        original_workflow: dict[str, Any],
        normalized_workflow: dict[str, Any],
        workflow_id: str,
        origin: str,
        source_label: str,
    ) -> None:
        schema_params = extract_schema_params(normalized_workflow)
        final_schema = build_final_schema(schema_params, sync_names_back=True)
        self.service.save_workflow(
            server_id=self.server_id,
            workflow_id=workflow_id,
            original_workflow_id=None,
            overwrite_existing=False,
            description=self._suggest_description(original_workflow, normalized_workflow, source_label),
            workflow_data=normalized_workflow,
            schema_params=final_schema,
            ui_schema_params=schema_params,
            origin=origin,
            source_label=source_label,
            tags=["imported", "comfyui"] if origin == "comfyui_server" else ["imported", "local"],
        )

    def _normalize_workflow_payload(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        if is_api_workflow(workflow_data):
            return workflow_data
        if not is_editor_workflow(workflow_data):
            raise WorkflowImportError("Unsupported workflow JSON format.")
        return EditorWorkflowConverter(self._get_object_info()).convert(workflow_data)

    def _get_object_info(self) -> dict[str, Any]:
        if self._object_info is None:
            try:
                self._object_info = self._build_server_api().get_object_info()
            except (requests.RequestException, ComfyUIClientError) as exc:
                raise WorkflowImportError(f"Failed to load ComfyUI object_info for workflow conversion: {exc}") from exc
        return self._object_info

    def _build_server_api(self) -> ComfyUIServerAPI:
        return ComfyUIServerAPI(self._require_server_url(), self._server_auth())

    def _get_server_entry(self) -> dict[str, Any]:
        config = self.service.get_config()
        for server in config.get("servers", []):
            if isinstance(server, dict) and server.get("id") == self.server_id:
                return server
        raise FileNotFoundError(f"Server '{self.server_id}' not found")

    def _require_server_url(self) -> str:
        server_url = normalize_string(self._config_server.get("url"))
        if not server_url:
            raise WorkflowImportError(f"Server '{self.server_id}' has no URL configured.")
        return server_url

    def _server_auth(self) -> str:
        return normalize_string(self._config_server.get("auth"))

    @staticmethod
    def _suggest_description(original_workflow: dict[str, Any], normalized_workflow: dict[str, Any], source_label: str) -> str:
        candidates = [
            original_workflow.get("title"),
            original_workflow.get("name"),
            original_workflow.get("workflow_name"),
            normalized_workflow.get("title"),
            normalized_workflow.get("name"),
            normalized_workflow.get("workflow_name"),
        ]
        for candidate in candidates:
            text = normalize_string(candidate)
            if text:
                return text

        for node_object in normalized_workflow.values():
            if not isinstance(node_object, dict):
                continue
            meta = node_object.get("_meta")
            if isinstance(meta, dict):
                title = normalize_string(meta.get("title"))
                if title:
                    return title

        return re.sub(r"\.[^.]+$", "", source_label).strip()


__all__ = [
    "BulkImportItem",
    "BulkImportPreviewItem",
    "BulkImportPreviewReport",
    "BulkImportReport",
    "ComfyUIClientError",
    "ComfyUIServerAPI",
    "EditorWorkflowConverter",
    "WorkflowBulkImporter",
    "WorkflowImportError",
    "build_final_schema",
    "extract_schema_params",
    "suggest_workflow_id",
]
