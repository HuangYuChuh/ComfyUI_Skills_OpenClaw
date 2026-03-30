from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class ServerModel(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    url: str = Field(min_length=1)
    auth: str = ""
    comfy_api_key: str = ""
    enabled: bool = True
    output_dir: str = "./outputs"

    @field_validator("id", mode="before")
    @classmethod
    def normalize_id(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("name", "url", "output_dir", mode="before")
    @classmethod
    def normalize_string_fields(cls, value: Any, info) -> str:
        if value is None:
            if info.field_name == "output_dir":
                return "./outputs"
            return ""
        return str(value)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Server ID is required")
        if any(c in value for c in ("/", "\\", " ")) or value in {".", ".."}:
            raise ValueError("Server ID contains invalid characters")
        return value

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Server URL is required")
        return value


class ConfigModel(BaseModel):
    servers: list[ServerModel]
    default_server: str = "local"


class CreateServerModel(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1)
    url: str = Field(min_length=1)
    auth: str = ""
    comfy_api_key: str = ""
    enabled: bool = True
    output_dir: str = "./outputs"

    @field_validator("id", mode="before")
    @classmethod
    def normalize_optional_id(cls, value: Any) -> str | None:
        if value is None:
            return None
        return str(value)

    @field_validator("name", "url", "output_dir", mode="before")
    @classmethod
    def normalize_create_string_fields(cls, value: Any, info) -> str:
        if value is None:
            if info.field_name == "output_dir":
                return "./outputs"
            return ""
        return str(value)

    @field_validator("id")
    @classmethod
    def validate_optional_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if any(c in value for c in ("/", "\\", " ")) or value in {".", ".."}:
            raise ValueError("Server ID contains invalid characters")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Server name is required")
        return value

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Server URL is required")
        return value


class SchemaModel(BaseModel):
    workflow_id: str = Field(min_length=1)
    server_id: str = Field(min_length=1, default="local")
    original_workflow_id: str | None = None
    overwrite_existing: bool = False
    description: str = ""
    workflow_data: dict[str, Any]
    schema_params: dict[str, dict[str, Any]]
    ui_schema_params: dict[str, dict[str, Any]] | None = None

    @field_validator("workflow_id", "original_workflow_id")
    @classmethod
    def normalize_workflow_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Workflow ID is required")
        if any(separator in value for separator in ("/", "\\")) or value in {".", ".."}:
            raise ValueError("Workflow ID contains invalid path characters")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()


class ToggleModel(BaseModel):
    enabled: bool


class WorkflowIdsModel(BaseModel):
    workflow_ids: list[str] = Field(min_length=1)

    @field_validator("workflow_ids", mode="before")
    @classmethod
    def normalize_workflow_ids(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("workflow_ids must be a list")
        return [str(item) for item in value]

    @field_validator("workflow_ids")
    @classmethod
    def validate_workflow_ids(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()

        for workflow_id in value:
            workflow_id = workflow_id.strip()
            if not workflow_id:
                raise ValueError("Workflow ID is required")
            if any(separator in workflow_id for separator in ("/", "\\")) or workflow_id in {".", ".."}:
                raise ValueError("Workflow ID contains invalid path characters")
            if workflow_id in seen:
                continue
            seen.add(workflow_id)
            normalized.append(workflow_id)

        if not normalized:
            raise ValueError("At least one workflow ID is required")

        return normalized


class WorkflowOrderModel(WorkflowIdsModel):
    pass


class WorkflowBatchDeleteModel(WorkflowIdsModel):
    pass


class TransferPreviewModel(BaseModel):
    bundle: dict[str, Any]
    apply_environment: bool = False
    overwrite_workflows: bool = True


class TransferImportModel(BaseModel):
    bundle: dict[str, Any]
    apply_environment: bool = False
    overwrite_workflows: bool = True


class TransferExportModel(BaseModel):
    selection: dict[str, Any] | None = None


class LocalWorkflowImportFileModel(BaseModel):
    file_name: str = Field(min_length=1)
    content: str = Field(min_length=1)

    @field_validator("file_name", "content", mode="before")
    @classmethod
    def normalize_string(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)


class LocalWorkflowImportModel(BaseModel):
    files: list[LocalWorkflowImportFileModel] = Field(min_length=1)


class RunWorkflowModel(BaseModel):
    args: dict[str, Any] = Field(default_factory=dict)


class CheckDependencyModel(BaseModel):
    """Request body for checking workflow dependencies.

    Provide either ``workflow_data`` (raw API-format workflow JSON) or leave
    it empty to check an already-saved workflow via the URL path parameter.
    """

    workflow_data: dict[str, Any] | None = None
    locale: str = "zh"  # "zh" or "en"
