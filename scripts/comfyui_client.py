from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import uuid
from logging import getLogger
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.config import get_server_schema_path, get_server_workflow_path
from shared.execution_history import build_run_record, get_run_record, save_run_record, utc_now_iso
from shared.json_utils import load_json
from shared.runtime_config import get_default_server_id, get_server_by_id

logger = getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def is_valid_identifier(value: str) -> bool:
    if not value:
        return False
    if value in {".", ".."}:
        return False
    if any(sep in value for sep in ("/", "\\")):
        return False
    return True


def parse_workflow_arg(workflow_arg: str) -> tuple[str, str]:
    if "/" in workflow_arg:
        parts = workflow_arg.split("/", 1)
        return parts[0], parts[1]
    return get_default_server_id(), workflow_arg


def sanitize_filename_part(value: str, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("._-")
    return normalized or fallback


def get_output_prefix(workflow_id: str, input_args: dict[str, Any], parameters: dict[str, Any]) -> str:
    for key, param in parameters.items():
        if param.get("field") == "filename_prefix" and key in input_args:
            return sanitize_filename_part(str(input_args[key]), workflow_id)

    raw_prefix = input_args.get("filename_prefix")
    if raw_prefix is not None:
        return sanitize_filename_part(str(raw_prefix), workflow_id)

    return sanitize_filename_part(workflow_id, "image")


def build_output_filename(prefix: str, timestamp: str, index: int, original_filename: str) -> str:
    _, ext = os.path.splitext(original_filename)
    ext = ext or ".png"
    return f"{prefix}_{timestamp}_{index:02d}{ext}"


def _add_auth(req: urllib.request.Request, auth: str) -> None:
    if auth:
        req.add_header("Authorization", auth)


def format_node_errors(node_errors: dict[str, Any]) -> str:
    lines: list[str] = []
    for node_id, errors in node_errors.items():
        if isinstance(errors, dict):
            class_type = errors.get("class_type", node_id)
            for err in errors.get("errors", []):
                message = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                lines.append(f"  Node {node_id} ({class_type}): {message}")
        elif isinstance(errors, list):
            for err in errors:
                lines.append(f"  Node {node_id}: {err}")
        else:
            lines.append(f"  Node {node_id}: {errors}")
    return "\n".join(lines) if lines else ""


def format_execution_errors(messages: list[Any]) -> str:
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, (list, tuple)) and len(msg) >= 2:
            msg_type, msg_data = msg[0], msg[1]
            if isinstance(msg_data, dict) and msg_type == "execution_error":
                node_id = msg_data.get("node_id", "?")
                node_type = msg_data.get("node_type", "?")
                exception_message = msg_data.get("exception_message", "Unknown error")
                lines.append(f"  Node {node_id} ({node_type}): {exception_message}")
    if lines:
        return "Execution failed:\n" + "\n".join(lines)
    return "Execution failed (no output produced)."


def _build_merged_parameters(
    parameters: dict[str, Any],
    ui_parameters: dict[str, Any] | None,
) -> dict[str, Any]:
    """Merge ``parameters`` (explicit) with ``ui_parameters`` (fallback).

    ``parameters`` entries always take precedence.  For every entry in
    ``ui_parameters`` whose ``name`` (or ``field``) is not already covered by
    ``parameters``, a lightweight mapping is added so that user-supplied values
    can reach the correct workflow node even when the parameter was never
    explicitly "exposed" in the UI.
    """
    merged: dict[str, Any] = dict(parameters)
    if not ui_parameters:
        return merged

    covered_names: set[str] = set(merged.keys())

    for _ui_key, ui_entry in ui_parameters.items():
        if not isinstance(ui_entry, dict):
            continue
        name = str(ui_entry.get("name") or "").strip()
        field = str(ui_entry.get("field") or "").strip()
        if not name and not field:
            continue

        lookup_key = name or field
        if lookup_key in covered_names:
            continue

        merged[lookup_key] = {
            "node_id": ui_entry.get("node_id"),
            "field": field,
            "required": False,
            "type": str(ui_entry.get("type") or "string"),
            "description": str(ui_entry.get("description") or ""),
        }
        if "currentVal" in ui_entry:
            merged[lookup_key]["default"] = ui_entry["currentVal"]
        covered_names.add(lookup_key)

    return merged


def validate_and_coerce_params(input_args: dict[str, Any], parameters: dict[str, Any]) -> tuple[dict[str, Any], list[str], list[str]]:
    errors: list[str] = []
    coerced: dict[str, Any] = {}
    warnings: list[str] = []

    for key, param in parameters.items():
        if param.get("required", False) and key not in input_args:
            if "default" in param:
                coerced[key] = param["default"]
            else:
                errors.append(f"Missing required parameter '{key}'")

    for key, value in input_args.items():
        if key not in parameters:
            warnings.append(f"Parameter '{key}' is not defined in the workflow schema and will be ignored. Available parameters: {sorted(parameters.keys())}")
            continue

        param = parameters[key]
        param_type = param.get("type", "string")

        try:
            if param_type == "int":
                value = int(value)
            elif param_type == "float":
                value = float(value)
            elif param_type == "boolean":
                if isinstance(value, str):
                    value = value.lower() not in ("false", "0", "no", "")
                else:
                    value = bool(value)
        except (ValueError, TypeError):
            errors.append(f"Parameter '{key}': cannot convert {value!r} to {param_type}")
            continue

        coerced[key] = value

    for key, param in parameters.items():
        if key not in coerced and "default" in param:
            coerced[key] = param["default"]

    return coerced, errors, warnings


def queue_prompt(server_url: str, prompt_workflow: dict[str, Any], auth: str = "", comfy_api_key: str = "") -> dict[str, Any]:
    payload: dict[str, Any] = {"prompt": prompt_workflow, "client_id": str(uuid.uuid4())}
    if comfy_api_key:
        payload["extra_data"] = {"api_key_comfy_org": comfy_api_key}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{server_url}/prompt", data=data, headers={"Content-Type": "application/json"})
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read())
        except Exception:
            body = None
        return body or {"error": f"HTTP {exc.code} from ComfyUI"}
    except urllib.error.URLError as exc:
        return {"error": f"Cannot connect to ComfyUI ({server_url}): {exc.reason}"}


def get_history(server_url: str, prompt_id: str, auth: str = "") -> dict[str, Any] | None:
    req = urllib.request.Request(f"{server_url}/history/{prompt_id}")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.URLError:
        return None


def is_job_in_queue(server_url: str, prompt_id: str, auth: str = "") -> bool:
    """Check if prompt_id is still pending or running in ComfyUI queue."""
    req = urllib.request.Request(f"{server_url}/queue")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            queue_data = json.loads(response.read())
        running = queue_data.get("queue_running", [])
        pending = queue_data.get("queue_pending", [])
        all_jobs = running + pending
        return any(job[1] == prompt_id for job in all_jobs if len(job) > 1)
    except urllib.error.URLError:
        # 网络抖动时保守处理，假设任务还活着
        return True


def get_image(server_url: str, filename: str, subfolder: str, folder_type: str, auth: str = "") -> bytes | None:
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    req = urllib.request.Request(f"{server_url}/view?{url_values}")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except urllib.error.URLError:
        return None


def _build_error_payload(message: str, run_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": "error", "error": message}
    if run_id:
        payload["run_id"] = run_id
    return payload


def _finalize_record(
    record: dict[str, Any],
    server_id: str,
    workflow_id: str,
    *,
    status: str,
    resolved_args: dict[str, Any] | None = None,
    prompt_id: str | None = None,
    images: list[str] | None = None,
    error_message: str | None = None,
) -> None:
    record["status"] = status
    record["finished_at"] = utc_now_iso()
    started_at = record.get("_started_monotonic")
    if isinstance(started_at, (int, float)):
        record["duration_ms"] = int((time.monotonic() - started_at) * 1000)
    else:
        record["duration_ms"] = None
    record.pop("_started_monotonic", None)

    if resolved_args is not None:
        record["resolved_args"] = resolved_args
    if prompt_id is not None:
        record["prompt_id"] = prompt_id

    if images is not None:
        record["result"] = {
            "images": images,
            "image_count": len(images),
        }

    if error_message:
        record["error"] = {"message": error_message}
    else:
        record["error"] = None

    save_run_record(server_id, workflow_id, record)


def _mark_record_running(
    record: dict[str, Any],
    server_id: str,
    workflow_id: str,
    prompt_id: str,
) -> None:
    record["status"] = "running"
    record["started_at"] = utc_now_iso()
    record["prompt_id"] = prompt_id
    record["_started_monotonic"] = time.monotonic()
    save_run_record(server_id, workflow_id, record)


def get_queue_status(server_url: str, prompt_id: str, auth: str = "") -> dict[str, Any]:
    """Return queue position and phase for a prompt_id."""
    req = urllib.request.Request(f"{server_url}/queue")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            queue_data = json.loads(response.read())
    except urllib.error.URLError:
        return {"phase": "unknown"}

    running = queue_data.get("queue_running", [])
    pending = queue_data.get("queue_pending", [])

    for job in running:
        if len(job) > 1 and job[1] == prompt_id:
            return {"phase": "running"}

    for idx, job in enumerate(pending):
        if len(job) > 1 and job[1] == prompt_id:
            return {"phase": "queued", "position": idx + 1, "pending_total": len(pending)}

    return {"phase": "not_found"}


def _resolve_server_context(server_id: str) -> tuple[dict[str, Any] | None, str, str, str, str]:
    """Load and validate server config, return (error_payload | None, url, auth, output_dir, comfy_api_key)."""
    server = get_server_by_id(server_id)
    if not server:
        return _build_error_payload(f"Server '{server_id}' not found in config.json"), "", "", "", ""
    if not server.get("enabled", True):
        return _build_error_payload(f"Server '{server_id}' is disabled"), "", "", "", ""

    server_url = str(server.get("url", "http://127.0.0.1:8188"))
    server_auth = str(server.get("auth", ""))
    comfy_api_key = str(server.get("comfy_api_key", ""))
    output_dir = str(server.get("output_dir", os.path.join(BASE_DIR, "outputs")))
    if not os.path.isabs(output_dir):
        output_dir = os.path.join(BASE_DIR, output_dir)
    os.makedirs(output_dir, exist_ok=True)
    return None, server_url, server_auth, output_dir, comfy_api_key


def _load_workflow_and_schema(
    server_id: str, workflow_id: str,
) -> tuple[dict[str, Any] | None, dict[str, Any], dict[str, Any], Path, Path]:
    """Load workflow/schema files. Returns (error_payload | None, workflow_data, schema_data, wf_path, sc_path)."""
    workflow_path = Path(get_server_workflow_path(server_id, workflow_id))
    schema_path = Path(get_server_schema_path(server_id, workflow_id))
    if not workflow_path.exists():
        return _build_error_payload(f"Workflow file not found for '{server_id}/{workflow_id}'"), {}, {}, workflow_path, schema_path
    if not schema_path.exists():
        return _build_error_payload(f"Schema file not found for '{server_id}/{workflow_id}'"), {}, {}, workflow_path, schema_path

    try:
        workflow_data = load_json(workflow_path)
        schema_data = load_json(schema_path)
    except Exception as exc:
        logger.exception("Failed to load workflow or schema for %s/%s", server_id, workflow_id)
        return _build_error_payload(f"Failed to load workflow data: {exc}"), {}, {}, workflow_path, schema_path
    if not isinstance(workflow_data, dict):
        return _build_error_payload(f"Workflow data is invalid for '{server_id}/{workflow_id}'"), {}, {}, workflow_path, schema_path
    if not isinstance(schema_data, dict):
        return _build_error_payload(f"Schema data is invalid for '{server_id}/{workflow_id}'"), {}, {}, workflow_path, schema_path
    if not schema_data.get("enabled", True):
        return _build_error_payload(f"Workflow '{workflow_id}' is disabled on server '{server_id}'"), {}, {}, workflow_path, schema_path

    return None, workflow_data, schema_data, workflow_path, schema_path


# ---------------------------------------------------------------------------
# Non-blocking API: submit + status
# ---------------------------------------------------------------------------


def submit_workflow(workflow_arg: str, input_args: dict[str, Any]) -> dict[str, Any]:
    """Validate, inject params, queue the prompt, and return immediately with a run_id."""
    server_id, workflow_id = parse_workflow_arg(workflow_arg)
    return submit_workflow_by_ids(server_id, workflow_id, input_args)


def submit_workflow_by_ids(server_id: str, workflow_id: str, input_args: dict[str, Any]) -> dict[str, Any]:
    if not is_valid_identifier(server_id):
        return _build_error_payload("Invalid server id in workflow")
    if not is_valid_identifier(workflow_id):
        return _build_error_payload("Invalid workflow id in workflow")
    if not isinstance(input_args, dict):
        return _build_error_payload("Workflow arguments must be a JSON object")

    err, server_url, server_auth, _output_dir, comfy_api_key = _resolve_server_context(server_id)
    if err:
        return err

    err, workflow_data, schema_data, workflow_path, schema_path = _load_workflow_and_schema(server_id, workflow_id)
    if err:
        return err

    run_id = str(uuid.uuid4())
    record = build_run_record(server_id, workflow_id, run_id, input_args, workflow_path, schema_path)
    save_run_record(server_id, workflow_id, record)

    raw_parameters = schema_data.get("parameters", {})
    if not isinstance(raw_parameters, dict):
        error_payload = _build_error_payload(f"Schema parameters are invalid for '{server_id}/{workflow_id}'", run_id)
        _finalize_record(record, server_id, workflow_id, status="error", error_message=error_payload["error"])
        return error_payload

    parameters = _build_merged_parameters(raw_parameters, schema_data.get("ui_parameters"))

    coerced_args, validation_errors, param_warnings = validate_and_coerce_params(input_args, parameters)
    if validation_errors:
        error_message = "Parameter validation failed:\n" + "\n".join(f"  {error}" for error in validation_errors)
        _finalize_record(record, server_id, workflow_id, status="error", resolved_args=coerced_args, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    for key, value in coerced_args.items():
        if key not in parameters:
            continue
        node_id = str(parameters[key]["node_id"])
        field = parameters[key]["field"]
        if node_id in workflow_data and isinstance(workflow_data[node_id], dict) and "inputs" in workflow_data[node_id]:
            workflow_data[node_id]["inputs"][field] = value

    queue_res = queue_prompt(server_url, workflow_data, auth=server_auth, comfy_api_key=comfy_api_key)
    if not queue_res or "prompt_id" not in queue_res:
        error_message = "Failed to queue prompt to ComfyUI."
        if queue_res:
            raw_error = queue_res.get("error", error_message)
            error_message = raw_error.get("message", str(raw_error)) if isinstance(raw_error, dict) else str(raw_error)
            node_errors = queue_res.get("node_errors", {})
            if isinstance(node_errors, dict) and node_errors:
                error_message += "\n" + format_node_errors(node_errors)
        _finalize_record(record, server_id, workflow_id, status="error", resolved_args=coerced_args, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    prompt_id = str(queue_res["prompt_id"])
    record["resolved_args"] = coerced_args
    _mark_record_running(record, server_id, workflow_id, prompt_id)

    result: dict[str, Any] = {
        "status": "submitted",
        "server": server_id,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "prompt_id": prompt_id,
    }
    if param_warnings:
        result["warnings"] = param_warnings
    return result


def check_status(workflow_arg: str, run_id: str) -> dict[str, Any]:
    """Check current status of a submitted job. Downloads images when complete."""
    server_id, workflow_id = parse_workflow_arg(workflow_arg)
    return check_status_by_ids(server_id, workflow_id, run_id)


def check_status_by_ids(server_id: str, workflow_id: str, run_id: str) -> dict[str, Any]:
    if not is_valid_identifier(server_id):
        return _build_error_payload("Invalid server id")
    if not is_valid_identifier(workflow_id):
        return _build_error_payload("Invalid workflow id")

    # Load the existing run record
    try:
        record = get_run_record(server_id, workflow_id, run_id)
    except FileNotFoundError:
        return _build_error_payload(f"Run record '{run_id}' not found for '{server_id}/{workflow_id}'")
    except ValueError as exc:
        return _build_error_payload(str(exc))

    # Already finalized (success or error) — return cached result
    current_status = record.get("status", "")
    if current_status in ("success", "error"):
        result: dict[str, Any] = {
            "status": current_status,
            "server": server_id,
            "workflow_id": workflow_id,
            "run_id": run_id,
            "prompt_id": record.get("prompt_id"),
        }
        if current_status == "success":
            result_data = record.get("result", {})
            result["images"] = result_data.get("images", []) if isinstance(result_data, dict) else []
        else:
            error_data = record.get("error", {})
            result["error"] = error_data.get("message", "") if isinstance(error_data, dict) else ""
        if record.get("duration_ms") is not None:
            result["duration_ms"] = record["duration_ms"]
        return result

    prompt_id = record.get("prompt_id")
    if not prompt_id:
        return _build_error_payload("Run record has no prompt_id (submit may have failed)", run_id)

    # Resolve server context
    err, server_url, server_auth, output_dir, _comfy_api_key = _resolve_server_context(server_id)
    if err:
        return err

    # Check ComfyUI history first (job might be done)
    history = get_history(server_url, prompt_id, auth=server_auth)
    if history and prompt_id in history:
        job_info = history[prompt_id]
        return _process_completed_job(job_info, record, server_id, workflow_id, run_id, prompt_id, server_url, server_auth, output_dir)

    # Not done yet — check queue position
    queue_info = get_queue_status(server_url, prompt_id, auth=server_auth)
    phase = queue_info.get("phase", "unknown")

    if phase == "not_found":
        # Not in history AND not in queue — job disappeared
        error_message = f"Job {prompt_id} disappeared from queue without producing results"
        _finalize_record(record, server_id, workflow_id, status="error", prompt_id=prompt_id, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    # Still in progress
    elapsed_ms = None
    started_mono = record.get("_started_monotonic")
    started_at = record.get("started_at")
    if isinstance(started_mono, (int, float)):
        elapsed_ms = int((time.monotonic() - started_mono) * 1000)
    elif started_at:
        try:
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(started_at)
            elapsed_ms = int((datetime.now(timezone.utc) - dt).total_seconds() * 1000)
        except Exception:
            pass

    result = {
        "status": phase,  # "queued" or "running"
        "server": server_id,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "prompt_id": prompt_id,
    }
    if phase == "queued":
        result["queue_position"] = queue_info.get("position")
        result["queue_total"] = queue_info.get("pending_total")
    if elapsed_ms is not None:
        result["elapsed_ms"] = elapsed_ms
    return result


def _process_completed_job(
    job_info: Any,
    record: dict[str, Any],
    server_id: str,
    workflow_id: str,
    run_id: str,
    prompt_id: str,
    server_url: str,
    server_auth: str,
    output_dir: str,
) -> dict[str, Any]:
    """Handle a finished ComfyUI job: check errors, download images, finalize record."""
    if not isinstance(job_info, dict):
        error_message = "ComfyUI history payload is missing or invalid."
        _finalize_record(record, server_id, workflow_id, status="error", prompt_id=prompt_id, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    status_info = job_info.get("status", {})
    if isinstance(status_info, dict) and status_info.get("status_str") == "error":
        messages = status_info.get("messages", [])
        error_message = format_execution_errors(messages if isinstance(messages, list) else [])
        _finalize_record(record, server_id, workflow_id, status="error", prompt_id=prompt_id, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    if "outputs" not in job_info:
        error_message = "No outputs found in job execution."
        _finalize_record(record, server_id, workflow_id, status="error", prompt_id=prompt_id, error_message=error_message)
        return _build_error_payload(error_message, run_id)

    # Download images
    downloaded_files: list[str] = []
    output_prefix = sanitize_filename_part(workflow_id, "image")
    run_timestamp = f"{time.strftime('%Y%m%d-%H%M%S')}-{int((time.time() % 1) * 1000):03d}"
    image_index = 1
    outputs = job_info.get("outputs", {})

    if isinstance(outputs, dict):
        for node_output in outputs.values():
            if not isinstance(node_output, dict) or "images" not in node_output:
                continue
            for image in node_output["images"]:
                if not isinstance(image, dict):
                    continue
                filename = image.get("filename")
                if not filename:
                    continue
                subfolder = image.get("subfolder", "")
                folder_type = image.get("type", "output")
                img_data = get_image(server_url, str(filename), str(subfolder), str(folder_type), auth=server_auth)
                if img_data:
                    local_filename = build_output_filename(output_prefix, run_timestamp, image_index, str(filename))
                    local_filepath = os.path.join(output_dir, local_filename)
                    with open(local_filepath, "wb") as file:
                        file.write(img_data)
                    downloaded_files.append(local_filepath)
                    image_index += 1

    coerced_args = record.get("resolved_args") or record.get("raw_args") or {}
    _finalize_record(
        record, server_id, workflow_id,
        status="success", resolved_args=coerced_args, prompt_id=prompt_id, images=downloaded_files,
    )
    return {
        "status": "success",
        "server": server_id,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "prompt_id": prompt_id,
        "images": downloaded_files,
    }


# ---------------------------------------------------------------------------
# Blocking API (original behavior, unchanged)
# ---------------------------------------------------------------------------


def execute_workflow(workflow_arg: str, input_args: dict[str, Any]) -> dict[str, Any]:
    server_id, workflow_id = parse_workflow_arg(workflow_arg)
    return execute_workflow_by_ids(server_id, workflow_id, input_args)


def execute_workflow_by_ids(server_id: str, workflow_id: str, input_args: dict[str, Any]) -> dict[str, Any]:
    if not is_valid_identifier(server_id):
        return _build_error_payload("Invalid server id in workflow")
    if not is_valid_identifier(workflow_id):
        return _build_error_payload("Invalid workflow id in workflow")
    if not isinstance(input_args, dict):
        return _build_error_payload("Workflow arguments must be a JSON object")

    server = get_server_by_id(server_id)
    if not server:
        return _build_error_payload(f"Server '{server_id}' not found in config.json")
    if not server.get("enabled", True):
        return _build_error_payload(f"Server '{server_id}' is disabled")

    server_url = str(server.get("url", "http://127.0.0.1:8188"))
    server_auth = str(server.get("auth", ""))
    comfy_api_key = str(server.get("comfy_api_key", ""))
    output_dir = str(server.get("output_dir", os.path.join(BASE_DIR, "outputs")))
    if not os.path.isabs(output_dir):
        output_dir = os.path.join(BASE_DIR, output_dir)
    os.makedirs(output_dir, exist_ok=True)

    workflow_path = Path(get_server_workflow_path(server_id, workflow_id))
    schema_path = Path(get_server_schema_path(server_id, workflow_id))
    if not workflow_path.exists():
        return _build_error_payload(f"Workflow file not found for '{server_id}/{workflow_id}'")
    if not schema_path.exists():
        return _build_error_payload(f"Schema file not found for '{server_id}/{workflow_id}'")

    try:
        workflow_data = load_json(workflow_path)
        schema_data = load_json(schema_path)
    except Exception as exc:
        logger.exception("Failed to load workflow or schema for %s/%s", server_id, workflow_id)
        return _build_error_payload(f"Failed to load workflow data: {exc}")
    if not isinstance(workflow_data, dict):
        return _build_error_payload(f"Workflow data is invalid for '{server_id}/{workflow_id}'")
    if not isinstance(schema_data, dict):
        return _build_error_payload(f"Schema data is invalid for '{server_id}/{workflow_id}'")
    if not schema_data.get("enabled", True):
        return _build_error_payload(f"Workflow '{workflow_id}' is disabled on server '{server_id}'")

    run_id = str(uuid.uuid4())
    record = build_run_record(server_id, workflow_id, run_id, input_args, workflow_path, schema_path)
    save_run_record(server_id, workflow_id, record)

    raw_parameters = schema_data.get("parameters", {})
    if not isinstance(raw_parameters, dict):
        error_payload = _build_error_payload(f"Schema parameters are invalid for '{server_id}/{workflow_id}'", run_id)
        _finalize_record(record, server_id, workflow_id, status="error", error_message=error_payload["error"])
        return error_payload

    parameters = _build_merged_parameters(raw_parameters, schema_data.get("ui_parameters"))

    coerced_args, validation_errors, param_warnings = validate_and_coerce_params(input_args, parameters)
    if validation_errors:
        error_message = "Parameter validation failed:\n" + "\n".join(f"  {error}" for error in validation_errors)
        _finalize_record(
            record,
            server_id,
            workflow_id,
            status="error",
            resolved_args=coerced_args,
            error_message=error_message,
        )
        return _build_error_payload(error_message, run_id)

    for key, value in coerced_args.items():
        if key not in parameters:
            continue
        node_id = str(parameters[key]["node_id"])
        field = parameters[key]["field"]
        if node_id in workflow_data and isinstance(workflow_data[node_id], dict) and "inputs" in workflow_data[node_id]:
            workflow_data[node_id]["inputs"][field] = value

    output_prefix = get_output_prefix(workflow_id, coerced_args, parameters)

    queue_res = queue_prompt(server_url, workflow_data, auth=server_auth, comfy_api_key=comfy_api_key)
    if not queue_res or "prompt_id" not in queue_res:
        error_message = "Failed to queue prompt to ComfyUI."
        if queue_res:
            raw_error = queue_res.get("error", error_message)
            error_message = raw_error.get("message", str(raw_error)) if isinstance(raw_error, dict) else str(raw_error)
            node_errors = queue_res.get("node_errors", {})
            if isinstance(node_errors, dict) and node_errors:
                error_message += "\n" + format_node_errors(node_errors)
        _finalize_record(
            record,
            server_id,
            workflow_id,
            status="error",
            resolved_args=coerced_args,
            error_message=error_message,
        )
        return _build_error_payload(error_message, run_id)

    prompt_id = str(queue_res["prompt_id"])
    _mark_record_running(record, server_id, workflow_id, prompt_id)

    job_info: dict[str, Any] | None = None
    while True:
        history = get_history(server_url, prompt_id, auth=server_auth)
        if history and prompt_id in history:
            job_info = history[prompt_id]
            break
        if not is_job_in_queue(server_url, prompt_id, auth=server_auth):
            error_message = f"Job {prompt_id} disappeared from queue without producing results"
            _finalize_record(
                record,
                server_id,
                workflow_id,
                status="error",
                resolved_args=coerced_args,
                prompt_id=prompt_id,
                error_message=error_message,
            )
            return _build_error_payload(error_message, run_id)
        time.sleep(2)

    if not isinstance(job_info, dict):
        error_message = "ComfyUI history payload is missing or invalid."
        _finalize_record(
            record,
            server_id,
            workflow_id,
            status="error",
            resolved_args=coerced_args,
            prompt_id=prompt_id,
            error_message=error_message,
        )
        return _build_error_payload(error_message, run_id)

    status_info = job_info.get("status", {})
    if isinstance(status_info, dict) and status_info.get("status_str") == "error":
        messages = status_info.get("messages", [])
        error_message = format_execution_errors(messages if isinstance(messages, list) else [])
        _finalize_record(
            record,
            server_id,
            workflow_id,
            status="error",
            resolved_args=coerced_args,
            prompt_id=prompt_id,
            error_message=error_message,
        )
        return _build_error_payload(error_message, run_id)

    if "outputs" not in job_info:
        error_message = "No outputs found in job execution."
        _finalize_record(
            record,
            server_id,
            workflow_id,
            status="error",
            resolved_args=coerced_args,
            prompt_id=prompt_id,
            error_message=error_message,
        )
        return _build_error_payload(error_message, run_id)

    downloaded_files: list[str] = []
    run_timestamp = f"{time.strftime('%Y%m%d-%H%M%S')}-{int((time.time() % 1) * 1000):03d}"
    image_index = 1
    outputs = job_info.get("outputs", {})

    if isinstance(outputs, dict):
        for node_output in outputs.values():
            if not isinstance(node_output, dict) or "images" not in node_output:
                continue
            for image in node_output["images"]:
                if not isinstance(image, dict):
                    continue
                filename = image.get("filename")
                if not filename:
                    continue
                subfolder = image.get("subfolder", "")
                folder_type = image.get("type", "output")
                img_data = get_image(server_url, str(filename), str(subfolder), str(folder_type), auth=server_auth)
                if img_data:
                    local_filename = build_output_filename(output_prefix, run_timestamp, image_index, str(filename))
                    local_filepath = os.path.join(output_dir, local_filename)
                    with open(local_filepath, "wb") as file:
                        file.write(img_data)
                    downloaded_files.append(local_filepath)
                    image_index += 1

    _finalize_record(
        record,
        server_id,
        workflow_id,
        status="success",
        resolved_args=coerced_args,
        prompt_id=prompt_id,
        images=downloaded_files,
    )
    result: dict[str, Any] = {
        "status": "success",
        "server": server_id,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "prompt_id": prompt_id,
        "images": downloaded_files,
    }
    if param_warnings:
        result["warnings"] = param_warnings
    return result


def _cmd_run(args: argparse.Namespace) -> None:
    """Legacy blocking execution (default behavior)."""
    try:
        input_args = json.loads(args.args)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "Invalid JSON format for --args"}))
        return
    result = execute_workflow(args.workflow, input_args)
    print(json.dumps(result))


def _cmd_submit(args: argparse.Namespace) -> None:
    """Non-blocking: submit job and return immediately."""
    try:
        input_args = json.loads(args.args)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "Invalid JSON format for --args"}))
        return
    result = submit_workflow(args.workflow, input_args)
    print(json.dumps(result))


def _cmd_status(args: argparse.Namespace) -> None:
    """Non-blocking: check job status, download images when complete."""
    result = check_status(args.workflow, args.run_id)
    print(json.dumps(result))


def _cmd_check_deps(args: argparse.Namespace) -> None:
    """Check workflow dependencies before execution."""
    server_id, workflow_id = parse_workflow_arg(args.workflow)

    err, server_url, server_auth, _output_dir, _comfy_api_key = _resolve_server_context(server_id)
    if err:
        print(json.dumps(err))
        return

    err, workflow_data, schema_data, _, _ = _load_workflow_and_schema(server_id, workflow_id)
    if err:
        print(json.dumps(err))
        return

    # Import dependency checker (lives in ui/ package)
    _ui_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui")
    if _ui_dir not in sys.path:
        sys.path.insert(0, _ui_dir)

    try:
        from dependency_checker import check_dependencies, DependencyCheckError
        report = check_dependencies(server_url, server_auth, workflow_data)
        print(json.dumps({"status": "success", "report": report.to_dict()}))
    except DependencyCheckError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": f"Dependency check failed: {exc}"}))


def _cmd_install_deps(args: argparse.Namespace) -> None:
    """Install missing custom node packages."""
    server_id, _ = parse_workflow_arg(args.workflow)

    err, server_url, server_auth, _output_dir, _comfy_api_key = _resolve_server_context(server_id)
    if err:
        print(json.dumps(err))
        return

    try:
        repo_urls = json.loads(args.repos)
        if not isinstance(repo_urls, list):
            print(json.dumps({"status": "error", "error": "--repos must be a JSON array of URLs"}))
            return
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "Invalid JSON for --repos"}))
        return

    _ui_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui")
    if _ui_dir not in sys.path:
        sys.path.insert(0, _ui_dir)

    try:
        from dependency_installer import DependencyInstaller
        installer = DependencyInstaller(server_url, server_auth)
        report = installer.install_nodes(repo_urls)
        print(json.dumps({"status": "success", "report": report.to_dict()}))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": f"Installation failed: {exc}"}))


def main() -> None:
    parser = argparse.ArgumentParser(description="ComfyUI Client for OpenClaw Skill")
    subparsers = parser.add_subparsers(dest="command")

    # --- sub: submit ---
    sp_submit = subparsers.add_parser("submit", help="Submit a workflow job (non-blocking, returns run_id immediately)")
    sp_submit.add_argument("--workflow", required=True, help="Workflow identifier: '<server_id>/<workflow_id>'")
    sp_submit.add_argument("--args", required=True, help="JSON string of parameter key-values")
    sp_submit.set_defaults(func=_cmd_submit)

    # --- sub: status ---
    sp_status = subparsers.add_parser("status", help="Check job status (non-blocking, downloads images when complete)")
    sp_status.add_argument("--workflow", required=True, help="Workflow identifier: '<server_id>/<workflow_id>'")
    sp_status.add_argument("--run-id", required=True, help="Run ID returned by the submit command")
    sp_status.set_defaults(func=_cmd_status)

    # --- sub: check-deps ---
    sp_deps = subparsers.add_parser("check-deps", help="Check workflow for missing custom nodes and models")
    sp_deps.add_argument("--workflow", required=True, help="Workflow identifier: '<server_id>/<workflow_id>'")
    sp_deps.set_defaults(func=_cmd_check_deps)

    # --- sub: install-deps ---
    sp_install = subparsers.add_parser("install-deps", help="Install missing custom node packages")
    sp_install.add_argument("--workflow", required=True, help="Workflow identifier (used to resolve server): '<server_id>/<workflow_id>'")
    sp_install.add_argument("--repos", required=True, help="JSON array of repository URLs to install")
    sp_install.set_defaults(func=_cmd_install_deps)

    # --- legacy flags (no subcommand) ---
    parser.add_argument("--workflow", dest="legacy_workflow", help=argparse.SUPPRESS)
    parser.add_argument("--args", dest="legacy_args", help=argparse.SUPPRESS)

    args = parser.parse_args()

    if args.command:
        args.func(args)
    elif args.legacy_workflow and args.legacy_args:
        # Backward-compatible: python comfyui_client.py --workflow X --args '{}'
        args.workflow = args.legacy_workflow
        args.args = args.legacy_args
        _cmd_run(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
