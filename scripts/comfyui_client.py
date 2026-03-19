import os
import json
import uuid
import time
import argparse
import urllib.request
import urllib.parse
import sys
import re
from logging import getLogger

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.config import get_server_schema_path, get_server_workflow_path
from shared.json_utils import load_json
from shared.runtime_config import get_runtime_config, get_server_by_id, get_default_server_id

logger = getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def is_valid_identifier(value: str) -> bool:
    """Reject path-like identifiers to prevent path traversal."""
    if not value:
        return False
    if value in {".", ".."}:
        return False
    if any(sep in value for sep in ("/", "\\")):
        return False
    return True


def parse_workflow_arg(workflow_arg: str) -> tuple[str, str]:
    """Parse a composite workflow argument like 'server_id/workflow_id'.

    If no '/' is present, uses the default server.
    Returns (server_id, workflow_id).
    """
    if "/" in workflow_arg:
        parts = workflow_arg.split("/", 1)
        return parts[0], parts[1]
    else:
        return get_default_server_id(), workflow_arg


def sanitize_filename_part(value: str, fallback: str) -> str:
    """Build a readable, filesystem-safe filename component."""
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("._-")
    return normalized or fallback


def get_output_prefix(workflow_id: str, input_args: dict, parameters: dict) -> str:
    """Prefer an explicit filename_prefix arg, otherwise fall back to workflow_id."""
    for key, param in parameters.items():
        if param.get("field") == "filename_prefix" and key in input_args:
            return sanitize_filename_part(str(input_args[key]), workflow_id)

    raw_prefix = input_args.get("filename_prefix")
    if raw_prefix is not None:
        return sanitize_filename_part(str(raw_prefix), workflow_id)

    return sanitize_filename_part(workflow_id, "image")


def build_output_filename(prefix: str, timestamp: str, index: int, original_filename: str) -> str:
    """Create a stable, readable local filename for downloaded images."""
    _, ext = os.path.splitext(original_filename)
    ext = ext or ".png"
    return f"{prefix}_{timestamp}_{index:02d}{ext}"


def _add_auth(req: urllib.request.Request, auth: str) -> None:
    if auth:
        req.add_header("Authorization", auth)


def format_node_errors(node_errors: dict) -> str:
    """将 ComfyUI node_errors 字典格式化为可读文本。"""
    lines = []
    for node_id, errors in node_errors.items():
        if isinstance(errors, dict):
            class_type = errors.get("class_type", node_id)
            error_list = errors.get("errors", [])
            for err in error_list:
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                lines.append(f"  Node {node_id} ({class_type}): {msg}")
        elif isinstance(errors, list):
            for err in errors:
                lines.append(f"  Node {node_id}: {err}")
        else:
            lines.append(f"  Node {node_id}: {errors}")
    return "\n".join(lines) if lines else ""


def format_execution_errors(messages: list) -> str:
    """将 ComfyUI history status.messages 格式化为可读文本。"""
    lines = []
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


def validate_and_coerce_params(input_args: dict, parameters: dict) -> tuple[dict, list[str]]:
    """Validate input_args against schema parameters and coerce types.

    Returns (coerced_args, errors) where coerced_args contains type-converted
    values and defaults applied, and errors is a list of validation messages.
    """
    errors = []
    coerced = {}

    # Check required parameters are present
    for key, param in parameters.items():
        if param.get("required", False) and key not in input_args:
            if "default" in param:
                coerced[key] = param["default"]
            else:
                errors.append(f"Missing required parameter '{key}'")

    # Validate and coerce provided values
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

    # Apply defaults for optional parameters not provided
    for key, param in parameters.items():
        if key not in coerced and "default" in param:
            coerced[key] = param["default"]

    return coerced, errors


def queue_prompt(server_url, prompt_workflow, auth=""):
    data = json.dumps({"prompt": prompt_workflow, "client_id": str(uuid.uuid4())}).encode('utf-8')
    req = urllib.request.Request(f"{server_url}/prompt", data=data, headers={'Content-Type': 'application/json'})
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            body = None
        return body or {"error": f"HTTP {e.code} from ComfyUI"}
    except urllib.error.URLError as e:
        return {"error": f"Cannot connect to ComfyUI ({server_url}): {e.reason}"}


def get_history(server_url, prompt_id, auth=""):
    req = urllib.request.Request(f"{server_url}/history/{prompt_id}")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.URLError:
        return None


def get_image(server_url, filename, subfolder, folder_type, auth=""):
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    req = urllib.request.Request(f"{server_url}/view?{url_values}")
    _add_auth(req, auth)
    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except urllib.error.URLError:
        return None


def main():
    parser = argparse.ArgumentParser(description="ComfyUI Client for OpenClaw Skill")
    parser.add_argument("--workflow", required=True,
                        help="Workflow identifier: '<server_id>/<workflow_id>' or just '<workflow_id>' (uses default server)")
    parser.add_argument("--args", required=True, help="JSON string of parameter key-values mapping to the schema")

    args = parser.parse_args()

    # 1. Parse composite workflow argument
    server_id, workflow_id = parse_workflow_arg(args.workflow)
    if not is_valid_identifier(server_id):
        print(json.dumps({"error": "Invalid server id in --workflow"}))
        return
    if not is_valid_identifier(workflow_id):
        print(json.dumps({"error": "Invalid workflow id in --workflow"}))
        return

    # 2. Look up server config
    server = get_server_by_id(server_id)
    if not server:
        print(json.dumps({"error": f"Server '{server_id}' not found in config.json"}))
        return

    if not server.get("enabled", True):
        print(json.dumps({"error": f"Server '{server_id}' is disabled"}))
        return

    server_url = server.get("url", "http://127.0.0.1:8188")
    server_auth = server.get("auth", "")
    output_dir = server.get("output_dir", os.path.join(BASE_DIR, "outputs"))

    # Resolve relative output_dir
    if not os.path.isabs(output_dir):
        output_dir = os.path.join(BASE_DIR, output_dir)

    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # 3. Parse input arguments
    try:
        input_args = json.loads(args.args)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON format for --args"}))
        return

    # 4. Load Workflow and Schema from server-specific directory
    wf_path = str(get_server_workflow_path(server_id, workflow_id))
    schema_path = str(get_server_schema_path(server_id, workflow_id))

    if not os.path.exists(wf_path):
        print(json.dumps({"error": f"Workflow file not found for '{server_id}/{workflow_id}'"}))
        return

    if not os.path.exists(schema_path):
        print(json.dumps({"error": f"Schema file not found for '{server_id}/{workflow_id}'"}))
        return

    workflow_data = load_json(wf_path)
    schema_data = load_json(schema_path)

    # Check workflow enabled
    if not schema_data.get("enabled", True):
        print(json.dumps({"error": f"Workflow '{workflow_id}' is disabled on server '{server_id}'"}))
        return

    parameters = schema_data.get("parameters", {})

    # 5. Validate parameters against schema
    coerced_args, validation_errors = validate_and_coerce_params(input_args, parameters)
    if validation_errors:
        print(json.dumps({"error": "Parameter validation failed:\n" + "\n".join(f"  {e}" for e in validation_errors)}))
        return

    # 6. Map parameters to workflow nodes
    for key, value in coerced_args.items():
        if key in parameters:
            node_id = str(parameters[key]["node_id"])
            field = parameters[key]["field"]
            if node_id in workflow_data and "inputs" in workflow_data[node_id]:
                workflow_data[node_id]["inputs"][field] = value

    output_prefix = get_output_prefix(workflow_id, coerced_args, parameters)

    # 7. Queue Prompt
    queue_res = queue_prompt(server_url, workflow_data, auth=server_auth)
    if not queue_res or 'prompt_id' not in queue_res:
        error_msg = "Failed to queue prompt to ComfyUI."
        if queue_res:
            error_msg = queue_res.get("error", error_msg)
            node_errors = queue_res.get("node_errors", {})
            if node_errors:
                error_msg += "\n" + format_node_errors(node_errors)
        print(json.dumps({"error": error_msg}))
        return

    prompt_id = queue_res['prompt_id']

    # 8. Poll for completion via history (timeout: 30 minutes)
    poll_timeout = 1800
    poll_elapsed = 0
    job_info = None
    while poll_elapsed < poll_timeout:
        history = get_history(server_url, prompt_id, auth=server_auth)
        if history and prompt_id in history:
            job_info = history[prompt_id]
            break
        time.sleep(2)
        poll_elapsed += 2
    if job_info is None:
        print(json.dumps({"error": f"Timed out waiting for job {prompt_id} after {poll_timeout}s"}))
        return

    # 9. Check for execution errors
    status_info = job_info.get("status", {})
    if status_info.get("status_str") == "error":
        messages = status_info.get("messages", [])
        error_msg = format_execution_errors(messages)
        print(json.dumps({"error": error_msg}))
        return

    # 10. Extract images
    if 'outputs' not in job_info:
        print(json.dumps({"error": "No outputs found in job execution."}))
        return

    downloaded_files = []
    run_timestamp = f"{time.strftime('%Y%m%d-%H%M%S')}-{int((time.time() % 1) * 1000):03d}"
    image_index = 1

    for node_id, node_output in job_info['outputs'].items():
        if 'images' in node_output:
            for image in node_output['images']:
                filename = image['filename']
                subfolder = image.get('subfolder', '')
                folder_type = image.get('type', 'output')

                img_data = get_image(server_url, filename, subfolder, folder_type, auth=server_auth)
                if img_data:
                    local_filename = build_output_filename(
                        output_prefix,
                        run_timestamp,
                        image_index,
                        filename,
                    )
                    local_filepath = os.path.join(output_dir, local_filename)
                    with open(local_filepath, "wb") as f:
                        f.write(img_data)
                    downloaded_files.append(local_filepath)
                    image_index += 1

    # Output the JSON result
    print(json.dumps({
        "status": "success",
        "server": server_id,
        "prompt_id": prompt_id,
        "images": downloaded_files,
    }))


if __name__ == "__main__":
    main()
