from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class ConfigModel(BaseModel):
    comfyui_server_url: str = Field(min_length=1)
    output_dir: str = Field(min_length=1)

    @field_validator("comfyui_server_url", "output_dir")
    @classmethod
    def strip_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value


class SchemaModel(BaseModel):
    workflow_id: str = Field(min_length=1)
    original_workflow_id: str | None = None
    overwrite_existing: bool = False
    description: str = ""
    workflow_data: dict[str, Any]
    schema_params: dict[str, dict[str, Any]]

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
