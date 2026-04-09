from __future__ import annotations

import re
from typing import Any


def normalize_string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def is_editor_workflow(workflow_data: Any) -> bool:
    return (
        isinstance(workflow_data, dict)
        and isinstance(workflow_data.get("nodes"), list)
        and isinstance(workflow_data.get("links"), list)
    )


def is_api_workflow(workflow_data: Any) -> bool:
    if not isinstance(workflow_data, dict) or not workflow_data:
        return False
    if is_editor_workflow(workflow_data):
        return False

    for key, value in workflow_data.items():
        if not isinstance(key, str) or not key.strip():
            return False
        if not isinstance(value, dict) or "class_type" not in value:
            return False
    return True


def _get_type_guess(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "int"
    if isinstance(value, float):
        return "float"
    return "string"


def _get_auto_mapping(node_class: str, field: str) -> dict[str, Any]:
    """Decide whether a field should be exposed and whether it's required.

    Returns exposure/required/description only — naming is handled separately
    by ``_assign_parameter_names`` after all parameters have been collected.
    """
    if "KSampler" in node_class:
        if field == "seed":
            return {"exposed": True, "required": False, "description": "Random seed (for reproducibility)"}
        if field == "steps":
            return {"exposed": True, "required": False, "description": "Generation steps"}

    if "CLIPTextEncode" in node_class or "Text" in node_class or "Prompt" in node_class:
        if field in {"text", "prompt"}:
            return {"exposed": True, "required": True, "description": "Text prompt description"}

    if node_class == "EmptyLatentImage" and field in {"width", "height", "batch_size"}:
        return {"exposed": True, "required": False, "description": f"Image {field}"}

    if node_class == "SaveImage" and field == "filename_prefix":
        return {"exposed": True, "required": False, "description": "Output file prefix"}

    if node_class == "LoadImage" and field == "image":
        return {"exposed": True, "required": True, "description": "Upload an image"}

    if node_class == "LightCCDoubaoImageNode":
        if field == "prompt":
            return {"exposed": True, "required": True, "description": "Positive image prompt"}
        if field == "size":
            return {"exposed": True, "required": False, "description": "e.g., 1:1,2048x2048"}
        if field == "seed":
            return {"exposed": True, "required": False, "description": "Random seed"}
        if field == "num":
            return {"exposed": True, "required": False, "description": "Number of images to generate"}

    if field in {"text", "prompt"}:
        return {"exposed": True, "required": True, "description": "Text prompt"}
    if field == "seed":
        return {"exposed": True, "required": False, "description": "Random seed"}
    if field in {"width", "height", "batch_size", "size", "num", "num_images", "max_images"}:
        return {"exposed": True, "required": False, "description": f"Workflow parameter: {field}"}
    if field == "filename_prefix":
        return {"exposed": True, "required": False, "description": "Output file prefix"}

    return {"exposed": False, "required": False, "description": ""}


def _normalize_title(title: str) -> str:
    """Normalize a node title into a safe parameter name suffix."""
    normalized = re.sub(r"[^\w]+", "_", title.strip(), flags=re.UNICODE)
    normalized = re.sub(r"_+", "_", normalized)
    return normalized.strip("_").lower()


def _get_node_title(node_object: dict[str, Any]) -> str:
    """Extract the user-defined title from a node's _meta."""
    meta = node_object.get("_meta")
    if isinstance(meta, dict):
        return normalize_string(meta.get("title"))
    return ""


def _assign_parameter_names(
    schema_params: dict[str, dict[str, Any]],
    workflow_data: dict[str, Any],
) -> None:
    """Assign unique, human-readable names to all parameters.

    - If a (class_type, field) pair appears only once → use ``field`` directly
      (e.g. ``seed``, ``prompt``).
    - If it appears multiple times → append the node's title or node_id to
      distinguish (e.g. ``seed_portrait_style`` or ``seed_23``).

    This is a **global** decision — we look at the entire workflow first,
    then name parameters, instead of naming them one-by-one.
    """
    # Count how many times each (class_type, field) pair appears among exposed params.
    pair_counts: dict[tuple[str, str], int] = {}
    for param in schema_params.values():
        if not param.get("exposed"):
            continue
        key = (param.get("nodeClass", ""), param.get("field", ""))
        pair_counts[key] = pair_counts.get(key, 0) + 1

    # Track used names to guarantee uniqueness.
    used_names: set[str] = set()

    for param in schema_params.values():
        field = param.get("field", "")
        node_class = param.get("nodeClass", "")
        node_id = str(param.get("node_id", ""))
        pair_key = (node_class, field)

        if pair_counts.get(pair_key, 0) <= 1:
            # Only one node with this (class_type, field) — use simple name.
            base_name = _friendly_field_name(field)
        else:
            # Multiple nodes — disambiguate with title or node_id.
            node_object = workflow_data.get(node_id, {})
            title = _get_node_title(node_object) if isinstance(node_object, dict) else ""
            # Skip title if it's just the class_type (default, not user-defined)
            normalized_title = _normalize_title(title) if title and title != node_class else ""
            suffix = normalized_title or node_id
            base_name = f"{_friendly_field_name(field)}_{suffix}"

        # Ensure uniqueness.
        name = base_name
        if name in used_names:
            name = f"{base_name}_{node_id}"
        counter = 2
        while name in used_names:
            name = f"{base_name}_{node_id}_{counter}"
            counter += 1

        used_names.add(name)
        param["name"] = name

        # Enrich description with node context for duplicate types.
        if pair_counts.get(pair_key, 0) > 1:
            node_object = workflow_data.get(node_id, {})
            title = _get_node_title(node_object) if isinstance(node_object, dict) else ""
            node_label = title or node_class or "Unknown"
            orig_desc = param.get("description", "")
            param["description"] = f"{orig_desc} ({node_label} #{node_id})"


def _friendly_field_name(field: str) -> str:
    """Map common field names to friendlier parameter names."""
    mapping = {
        "text": "prompt",
    }
    return mapping.get(field, field)


def extract_schema_params(workflow_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    schema_params: dict[str, dict[str, Any]] = {}

    for node_id, node_object in workflow_data.items():
        if not isinstance(node_object, dict):
            continue
        inputs = node_object.get("inputs")
        if not isinstance(inputs, dict):
            continue

        node_class = normalize_string(node_object.get("class_type"))
        for field, value in inputs.items():
            if isinstance(value, list):
                continue

            auto_mapping = _get_auto_mapping(node_class, field)
            schema_params[f"{node_id}_{field}"] = {
                "exposed": auto_mapping["exposed"],
                "node_id": node_id,
                "field": field,
                "name": "",  # assigned later by _assign_parameter_names
                "type": "image" if (node_class == "LoadImage" and field == "image") else _get_type_guess(value),
                "required": auto_mapping["required"],
                "description": auto_mapping["description"],
                "default": value,
                "example": value,
                "choices": [],
                "currentVal": value,
                "nodeClass": node_class or "UnknownNode",
            }

    # Assign names globally — this is where disambiguation happens.
    _assign_parameter_names(schema_params, workflow_data)

    return schema_params


def build_final_schema(
    schema_params: dict[str, dict[str, Any]],
    *,
    sync_names_back: bool = False,
) -> dict[str, dict[str, Any]]:
    """Build the run-time schema from UI parameters.

    When *sync_names_back* is True, the resolved (unique) alias is written
    back into each source ``schema_params`` entry so that ``ui_parameters``
    and ``parameters`` stay consistent.  This prevents the front-end from
    seeing duplicate names and silently dropping parameters on save.
    """
    final_schema: dict[str, dict[str, Any]] = {}
    for param_key, parameter in schema_params.items():
        if not bool(parameter.get("exposed")):
            continue

        alias = normalize_string(parameter.get("name"))
        if not alias:
            continue
        alias = _ensure_unique_alias(final_schema, alias, str(parameter["node_id"]))

        if sync_names_back:
            parameter["name"] = alias

        target: dict[str, Any] = {
            "node_id": str(parameter["node_id"]),
            "field": normalize_string(parameter.get("field")),
            "required": bool(parameter.get("required", False)),
            "type": normalize_string(parameter.get("type"), "string") or "string",
            "description": normalize_string(parameter.get("description")),
        }
        if "default" in parameter:
            target["default"] = parameter["default"]
        if "example" in parameter:
            target["example"] = parameter["example"]
        choices = parameter.get("choices")
        if isinstance(choices, list) and choices:
            target["choices"] = choices
        final_schema[alias] = target

    return final_schema


def _ensure_unique_alias(final_schema: dict[str, dict[str, Any]], alias: str, node_id: str) -> str:
    if alias not in final_schema:
        return alias

    node_scoped_alias = f"{alias}_{node_id}"
    if node_scoped_alias not in final_schema:
        return node_scoped_alias

    index = 2
    while f"{node_scoped_alias}_{index}" in final_schema:
        index += 1
    return f"{node_scoped_alias}_{index}"


def suggest_workflow_id(workflow_data: dict[str, Any], file_name: str = "") -> str:
    def normalize_candidate(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        normalized = re.sub(r"[./\\]+", "-", value.strip())
        normalized = re.sub(r"[^\w-]+", "-", normalized, flags=re.UNICODE)
        normalized = re.sub(r"-+", "-", normalized)
        return normalized.strip("-_")

    def first_node_title() -> str:
        for node_object in workflow_data.values():
            if not isinstance(node_object, dict):
                continue
            meta = node_object.get("_meta")
            if isinstance(meta, dict):
                title = normalize_string(meta.get("title"))
                if title:
                    return title
        return ""

    base_file_name = re.sub(r"\.[^.]+$", "", file_name).strip() if file_name else ""
    candidates = [
        workflow_data.get("workflow_name"),
        workflow_data.get("name"),
        workflow_data.get("title"),
        workflow_data.get("_meta", {}).get("title") if isinstance(workflow_data.get("_meta"), dict) else "",
        workflow_data.get("extra", {}).get("workflow_name") if isinstance(workflow_data.get("extra"), dict) else "",
        workflow_data.get("extra", {}).get("name") if isinstance(workflow_data.get("extra"), dict) else "",
        workflow_data.get("extra", {}).get("title") if isinstance(workflow_data.get("extra"), dict) else "",
        workflow_data.get("metadata", {}).get("workflow_name") if isinstance(workflow_data.get("metadata"), dict) else "",
        workflow_data.get("metadata", {}).get("name") if isinstance(workflow_data.get("metadata"), dict) else "",
        workflow_data.get("metadata", {}).get("title") if isinstance(workflow_data.get("metadata"), dict) else "",
        base_file_name,
        first_node_title(),
    ]

    for candidate in candidates:
        normalized = normalize_candidate(candidate)
        if normalized:
            return normalized
    return "workflow"


def _list_value(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


class WorkflowImportError(ValueError):
    pass


class EditorWorkflowConverter:
    def __init__(self, object_info: dict[str, Any]):
        self.object_info = object_info

    def convert(self, workflow_data: dict[str, Any]) -> dict[str, Any]:
        nodes = workflow_data.get("nodes")
        links = workflow_data.get("links")
        if not isinstance(nodes, list) or not isinstance(links, list):
            raise WorkflowImportError("Unsupported ComfyUI editor workflow format.")

        node_by_id: dict[int, dict[str, Any]] = {}
        for node in nodes:
            if isinstance(node, dict) and node.get("id") is not None:
                node_by_id[int(node["id"])] = node

        link_map: dict[tuple[int, int], tuple[str, int]] = {}
        for link in links:
            if not isinstance(link, list) or len(link) < 5:
                continue
            source_link = self._resolve_link_source(int(link[1]), int(link[2]), node_by_id, links)
            target_node_id = int(link[3])
            target_slot = int(link[4])
            if source_link is None:
                continue
            link_map[(target_node_id, target_slot)] = source_link

        api_workflow: dict[str, Any] = {}
        for node in nodes:
            if not isinstance(node, dict):
                continue

            node_id = node.get("id")
            class_type = normalize_string(node.get("type"))
            if node_id is None or not class_type:
                continue
            if class_type in {"Reroute", "Note"}:
                continue

            node_object_info = self.object_info.get(class_type)
            if not isinstance(node_object_info, dict):
                raise WorkflowImportError(f"ComfyUI object_info is missing node type '{class_type}'.")

            title = normalize_string(node.get("title"))
            api_workflow[str(node_id)] = {
                "inputs": self._convert_node_inputs(node, class_type, node_object_info, link_map),
                "class_type": class_type,
                "_meta": {"title": title or class_type},
            }

        if not api_workflow:
            raise WorkflowImportError("No supported nodes were found in the editor workflow.")

        return api_workflow

    def _resolve_link_source(
        self,
        source_node_id: int,
        source_slot: int,
        node_by_id: dict[int, dict[str, Any]],
        links: list[Any],
    ) -> tuple[str, int] | None:
        node = node_by_id.get(source_node_id)
        if not isinstance(node, dict):
            return (str(source_node_id), source_slot)

        class_type = normalize_string(node.get("type"))
        if class_type != "Reroute":
            return (str(source_node_id), source_slot)

        input_slots = _list_value(node.get("inputs"))
        if not input_slots:
            return None

        incoming_link_id = input_slots[0].get("link") if isinstance(input_slots[0], dict) else None
        if incoming_link_id is None:
            return None

        for link in links:
            if not isinstance(link, list) or len(link) < 5:
                continue
            if int(link[0]) != int(incoming_link_id):
                continue
            return self._resolve_link_source(int(link[1]), int(link[2]), node_by_id, links)

        return None

    def _convert_node_inputs(
        self,
        node: dict[str, Any],
        class_type: str,
        node_object_info: dict[str, Any],
        link_map: dict[tuple[int, int], tuple[str, int]],
    ) -> dict[str, Any]:
        node_id = int(node["id"])
        input_defs = self._ordered_input_defs(node_object_info)
        input_slots = _list_value(node.get("inputs"))
        widget_values = _list_value(node.get("widgets_values"))

        converted: dict[str, Any] = {}
        connected_names: set[str] = set()

        for slot_index, slot in enumerate(input_slots):
            if not isinstance(slot, dict):
                continue
            slot_name = normalize_string(slot.get("name"))
            if not slot_name:
                continue
            link_tuple = link_map.get((node_id, slot_index))
            if link_tuple is None:
                continue
            converted[slot_name] = [link_tuple[0], link_tuple[1]]
            connected_names.add(slot_name)

        widget_field_names = [
            normalize_string(slot.get("name"))
            for slot in input_slots
            if isinstance(slot, dict)
            and normalize_string(slot.get("name"))
            and normalize_string(slot.get("name")) not in connected_names
            and isinstance(slot.get("widget"), dict)
        ]

        if not widget_field_names:
            widget_field_names = [name for name in input_defs if name not in connected_names]

        control_after_generate_fields = self._control_after_generate_fields(node_object_info)
        widget_value_index = 0
        for field_name in widget_field_names:
            if widget_value_index >= len(widget_values):
                break

            converted[field_name] = widget_values[widget_value_index]
            widget_value_index += 1

            if field_name not in control_after_generate_fields:
                continue
            if widget_value_index >= len(widget_values):
                continue

            control_value = widget_values[widget_value_index]
            if isinstance(control_value, str) and control_value.lower() in {
                "fixed",
                "increment",
                "decrement",
                "randomize",
            }:
                widget_value_index += 1

        if not converted and widget_values and not widget_field_names:
            raise WorkflowImportError(f"Unable to map widget values for node type '{class_type}'.")

        return converted

    @staticmethod
    def _control_after_generate_fields(node_object_info: dict[str, Any]) -> set[str]:
        fields: set[str] = set()

        def visit_section(section: Any) -> None:
            if not isinstance(section, dict):
                return
            for field_name, definition in section.items():
                if (
                    isinstance(definition, list)
                    and len(definition) >= 2
                    and isinstance(definition[1], dict)
                    and definition[1].get("control_after_generate")
                ):
                    fields.add(field_name)

        input_section = node_object_info.get("input")
        if isinstance(input_section, dict):
            visit_section(input_section.get("required"))
            visit_section(input_section.get("optional"))

        visit_section(node_object_info.get("required"))
        visit_section(node_object_info.get("optional"))
        return fields

    @staticmethod
    def _ordered_input_defs(node_object_info: dict[str, Any]) -> list[str]:
        ordered: list[str] = []
        input_order = node_object_info.get("input_order")
        if isinstance(input_order, dict):
            for section_name in ("required", "optional"):
                section = input_order.get(section_name)
                if isinstance(section, list):
                    ordered.extend(normalize_string(item) for item in section if normalize_string(item))
        if ordered:
            return ordered

        input_section = node_object_info.get("input")
        if isinstance(input_section, dict):
            for section_name in ("required", "optional"):
                section = input_section.get(section_name)
                if isinstance(section, dict):
                    ordered.extend(section.keys())
        if ordered:
            return ordered

        for section_name in ("required", "optional"):
            section = node_object_info.get(section_name)
            if not isinstance(section, dict):
                continue
            ordered.extend(section.keys())
        return ordered
