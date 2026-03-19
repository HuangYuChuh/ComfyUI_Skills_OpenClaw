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
from shared.execution_history import build_run_record, save_run_record, utc_now_iso
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


def validate_and_coerce_params(input_args: dict[str, Any], parameters: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    coerced: dict[str, Any] = {}

    for key, param in parameters.items():
        if param.get("required", False) and key not in input_args:
            if "default" in param:
                coerced[key] = param["default"]
            else:
                errors.append(f"Missing required parameter '{key}'")

    for key, value in input_args.items():
        if key not in parameters:
            coerced[key] = value
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

    return coerced, errors


def queue_prompt(server_url: str, prompt_workflow: dict[str, Any], auth: str = "") -> dict[str, Any]:
    data = json.dumps({"prompt": prompt_workflow, "client_id": str(uuid.uuid4())}).encode("utf-8")
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

    parameters = schema_data.get("parameters", {})
    if not isinstance(parameters, dict):
        error_payload = _build_error_payload(f"Schema parameters are invalid for '{server_id}/{workflow_id}'", run_id)
        _finalize_record(record, server_id, workflow_id, status="error", error_message=error_payload["error"])
        return error_payload

    coerced_args, validation_errors = validate_and_coerce_params(input_args, parameters)
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

    queue_res = queue_prompt(server_url, workflow_data, auth=server_auth)
    if not queue_res or "prompt_id" not in queue_res:
        error_message = "Failed to queue prompt to ComfyUI."
        if queue_res:
            error_message = queue_res.get("error", error_message)
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
            print(json.dumps({"error": f"Job {prompt_id} disappeared from queue without producing results"}))
            return
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
    return {
        "status": "success",
        "server": server_id,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "prompt_id": prompt_id,
        "images": downloaded_files,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="ComfyUI Client for OpenClaw Skill")
    parser.add_argument(
        "--workflow",
        required=True,
        help="Workflow identifier: '<server_id>/<workflow_id>' or just '<workflow_id>' (uses default server)",
    )
    parser.add_argument("--args", required=True, help="JSON string of parameter key-values mapping to the schema")
    args = parser.parse_args()

    try:
        input_args = json.loads(args.args)
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "Invalid JSON format for --args"}))
        return

    result = execute_workflow(args.workflow, input_args)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
