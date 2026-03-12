from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from logging import getLogger
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from registry import inspect_workflows
from shared.config import COMFY_CLOUD_SERVER_TYPE, DEFAULT_COMFY_CLOUD_URL, DEFAULT_SERVER_TYPE, get_server_schema_path, get_server_workflow_path
from shared.json_utils import load_json
from shared.runtime_config import get_default_server_id, get_server_by_id

logger = getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
LOCAL_POLL_INTERVAL_SECONDS = 2
LOCAL_TIMEOUT_SECONDS = 600
CLOUD_POLL_INTERVAL_SECONDS = 2
CLOUD_TIMEOUT_SECONDS = 600


class WorkflowExecutionError(RuntimeError):
    pass


def is_valid_identifier(value: str) -> bool:
    """Reject path-like identifiers to prevent path traversal."""
    if not value:
        return False
    if value in {".", ".."}:
        return False
    if any(sep in value for sep in ("/", "\\")):
        return False
    return True


def parse_workflow_arg(workflow_arg: str) -> tuple[str | None, str]:
    """Parse a workflow argument.

    - `server_id/workflow_id` uses an explicit target server
    - `workflow_id` lets the client resolve a healthy target across servers
    """
    if "/" in workflow_arg:
        parts = workflow_arg.split("/", 1)
        return parts[0], parts[1]
    return None, workflow_arg


def ensure_output_dir(server: dict[str, Any]) -> Path:
    output_dir = str(server.get("output_dir") or "./outputs").strip() or "./outputs"
    output_path = Path(output_dir)
    if not output_path.is_absolute():
        output_path = BASE_DIR / output_path
    output_path.mkdir(parents=True, exist_ok=True)
    return output_path


def parse_input_args(raw_args: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_args)
    except json.JSONDecodeError as exc:
        raise WorkflowExecutionError("Invalid JSON format for --args") from exc
    if not isinstance(parsed, dict):
        raise WorkflowExecutionError("The --args payload must be a JSON object")
    return parsed


def load_workflow_bundle(server_id: str, workflow_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    workflow_path = get_server_workflow_path(server_id, workflow_id)
    schema_path = get_server_schema_path(server_id, workflow_id)

    if not workflow_path.exists():
        raise WorkflowExecutionError(f"Workflow file not found for '{server_id}/{workflow_id}'")
    if not schema_path.exists():
        raise WorkflowExecutionError(f"Schema file not found for '{server_id}/{workflow_id}'")

    workflow_data = load_json(workflow_path)
    schema_data = load_json(schema_path)
    if not isinstance(workflow_data, dict):
        raise WorkflowExecutionError(f"Workflow '{workflow_id}' is not a valid API-format JSON object")
    if not isinstance(schema_data, dict):
        raise WorkflowExecutionError(f"Schema '{workflow_id}' is not a valid JSON object")
    return workflow_data, schema_data


def coerce_parameter_value(param_type: str, value: Any) -> Any:
    normalized_type = str(param_type or "string").strip().lower()

    if normalized_type == "int":
        return int(value)
    if normalized_type == "float":
        return float(value)
    if normalized_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on"}:
                return True
            if normalized in {"false", "0", "no", "off", ""}:
                return False
        raise WorkflowExecutionError(f"Unable to coerce value '{value}' to boolean")
    return value


def apply_input_args(workflow_data: dict[str, Any], parameters: dict[str, Any], input_args: dict[str, Any]) -> None:
    for key, value in input_args.items():
        parameter = parameters.get(key)
        if not isinstance(parameter, dict):
            continue

        node_id = str(parameter.get("node_id") or "")
        field = str(parameter.get("field") or "")
        if not node_id or not field:
            continue

        node = workflow_data.get(node_id)
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue

        param_type = str(parameter.get("type") or "string")
        inputs[field] = coerce_parameter_value(param_type, value)


def build_error_message(response: requests.Response, default_message: str) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail") or payload.get("message") or payload.get("error")
        if detail:
            return f"{default_message}: {detail}"

    text = response.text.strip()
    if text:
        return f"{default_message}: {text}"
    return default_message


def probe_server_health(server: dict[str, Any]) -> tuple[bool, str]:
    server_id = str(server.get("id") or "").strip()
    server_type = str(server.get("server_type") or DEFAULT_SERVER_TYPE).strip() or DEFAULT_SERVER_TYPE
    if server_type == COMFY_CLOUD_SERVER_TYPE:
        base_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
        try:
            response = requests.get(f"{base_url}/api/user", headers=cloud_headers(resolve_cloud_api_key(server)), timeout=8)
        except (requests.RequestException, WorkflowExecutionError) as exc:
            return False, f"cloud target '{server_id}' is unreachable: {exc}"
        if response.ok:
            return True, f"cloud target '{server_id}' is healthy"
        return False, f"cloud target '{server_id}' returned HTTP {response.status_code}"

    server_url = str(server.get("url") or "").rstrip("/")
    try:
        response = requests.get(f"{server_url}/queue", timeout=8)
    except requests.RequestException as exc:
        return False, f"local target '{server_id}' is unreachable: {exc}"
    if response.ok:
        return True, f"local target '{server_id}' is healthy"
    return False, f"local target '{server_id}' returned HTTP {response.status_code}"


def resolve_workflow_target(requested_server_id: str | None, workflow_id: str) -> tuple[str, str, dict[str, Any]]:
    if requested_server_id:
        report = inspect_workflows()
        explicit_candidates = [
            workflow
            for workflow in report["workflows"]
            if str(workflow.get("server_id") or "").strip() == requested_server_id
            and workflow_id in {
                str(workflow.get("workflow_id") or "").strip(),
                str(workflow.get("logical_workflow_id") or "").strip(),
            }
        ]
        selected_workflow_id = workflow_id
        if explicit_candidates:
            selected = explicit_candidates[0]
            selected_workflow_id = str(selected.get("deployment_workflow_id") or selected.get("workflow_id") or workflow_id)

        return requested_server_id, selected_workflow_id, {
            "selection_reason": "explicit_target",
            "requested_server_id": requested_server_id,
        }

    report = inspect_workflows()
    candidates = [
        workflow
        for workflow in report["workflows"]
        if workflow_id in {
            str(workflow.get("workflow_id") or "").strip(),
            str(workflow.get("logical_workflow_id") or "").strip(),
        }
    ]
    if not candidates:
        raise WorkflowExecutionError(f"Workflow '{workflow_id}' was not found in the registry")

    visible_candidates = [workflow for workflow in candidates if workflow.get("_visible")]
    if not visible_candidates:
        hidden_reasons = ", ".join(
            f"{workflow.get('server_id')}: {'/'.join(workflow.get('_reasons', [])) or 'hidden'}"
            for workflow in candidates
        )
        raise WorkflowExecutionError(
            f"Workflow '{workflow_id}' exists but has no visible targets. Details: {hidden_reasons}"
        )

    default_server_id = get_default_server_id()
    checked_candidates: list[dict[str, Any]] = []
    for workflow in visible_candidates:
        server_id = str(workflow.get("server_id") or "").strip()
        server = get_server_by_id(server_id)
        if not server or not server.get("enabled", True):
            checked_candidates.append({
                "server_id": server_id,
                "healthy": False,
                "reason": f"target '{server_id}' is missing or disabled",
            })
            continue
        healthy, reason = probe_server_health(server)
        checked_candidates.append({
            "server_id": server_id,
            "healthy": healthy,
            "reason": reason,
        })

    healthy_candidates = [candidate for candidate in checked_candidates if candidate["healthy"]]
    if not healthy_candidates:
        details = ", ".join(f"{candidate['server_id']}: {candidate['reason']}" for candidate in checked_candidates)
        raise WorkflowExecutionError(
            f"Workflow '{workflow_id}' has visible targets, but none are healthy. {details}"
        )

    healthy_candidates.sort(key=lambda candidate: (0 if candidate["server_id"] == default_server_id else 1, candidate["server_id"]))
    selected = healthy_candidates[0]
    if selected["server_id"] == default_server_id:
        selection_reason = "default_server_healthy"
    else:
        selection_reason = f"default_server_unavailable_fallback_to_{selected['server_id']}"

    selected_workflow = next(
        workflow
        for workflow in visible_candidates
        if str(workflow.get("server_id") or "").strip() == selected["server_id"]
    )

    return selected["server_id"], str(selected_workflow.get("deployment_workflow_id") or selected_workflow.get("workflow_id") or workflow_id), {
        "selection_reason": selection_reason,
        "requested_server_id": requested_server_id,
        "health_checks": checked_candidates,
    }


def local_request_json(method: str, url: str, **kwargs: Any) -> Any:
    try:
        response = requests.request(method, url, timeout=60, **kwargs)
    except requests.RequestException as exc:
        raise WorkflowExecutionError(f"Error connecting to ComfyUI ({url}): {exc}") from exc

    if not response.ok:
        raise WorkflowExecutionError(build_error_message(response, f"ComfyUI request failed with HTTP {response.status_code}"))

    if not response.content:
        return {}
    return response.json()


def queue_local_prompt(server_url: str, prompt_workflow: dict[str, Any]) -> str:
    payload = {"prompt": prompt_workflow, "client_id": str(uuid.uuid4())}
    response = local_request_json("POST", f"{server_url.rstrip('/')}/prompt", json=payload)
    prompt_id = response.get("prompt_id")
    if not prompt_id:
        raise WorkflowExecutionError("Failed to queue prompt to ComfyUI.")
    return str(prompt_id)


def wait_for_local_completion(server_url: str, prompt_id: str) -> dict[str, Any]:
    deadline = time.time() + LOCAL_TIMEOUT_SECONDS
    history_url = f"{server_url.rstrip('/')}/history/{prompt_id}"

    while time.time() < deadline:
        history = local_request_json("GET", history_url)
        if isinstance(history, dict):
            if prompt_id in history and isinstance(history[prompt_id], dict):
                return history[prompt_id]
            if "outputs" in history:
                return history
        time.sleep(LOCAL_POLL_INTERVAL_SECONDS)

    raise WorkflowExecutionError(f"Local ComfyUI job '{prompt_id}' did not complete within {LOCAL_TIMEOUT_SECONDS}s")


def resolve_cloud_api_key(server: dict[str, Any]) -> str:
    direct_key = str(server.get("api_key") or "").strip()
    if direct_key:
        return direct_key

    env_name = str(server.get("api_key_env") or "").strip()
    if env_name:
        env_value = os.environ.get(env_name, "").strip()
        if env_value:
            return env_value
        raise WorkflowExecutionError(f"Environment variable '{env_name}' is not set for Comfy Cloud authentication")

    fallback = os.environ.get("COMFY_CLOUD_API_KEY", "").strip()
    if fallback:
        return fallback

    raise WorkflowExecutionError("Comfy Cloud API key is missing")


def cloud_headers(api_key: str, include_content_type: bool = False) -> dict[str, str]:
    headers = {"X-API-Key": api_key}
    if include_content_type:
        headers["Content-Type"] = "application/json"
    return headers


def cloud_request_json(method: str, url: str, api_key: str, **kwargs: Any) -> Any:
    headers = dict(kwargs.pop("headers", {}))
    headers.update(cloud_headers(api_key, include_content_type=kwargs.get("json") is not None))

    try:
        response = requests.request(method, url, headers=headers, timeout=60, **kwargs)
    except requests.RequestException as exc:
        raise WorkflowExecutionError(f"Error connecting to Comfy Cloud ({url}): {exc}") from exc

    if not response.ok:
        raise WorkflowExecutionError(build_error_message(response, f"Comfy Cloud request failed with HTTP {response.status_code}"))

    if not response.content:
        return {}
    return response.json()


def queue_cloud_prompt(server: dict[str, Any], prompt_workflow: dict[str, Any]) -> str:
    api_key = resolve_cloud_api_key(server)
    base_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
    payload: dict[str, Any] = {"prompt": prompt_workflow}

    if bool(server.get("use_api_key_for_partner_nodes")):
        payload["extra_data"] = {"api_key_comfy_org": api_key}

    response = cloud_request_json("POST", f"{base_url}/api/prompt", api_key, json=payload)
    if response.get("error"):
        raise WorkflowExecutionError(f"Comfy Cloud rejected the workflow: {response['error']}")

    prompt_id = response.get("prompt_id")
    if not prompt_id:
        raise WorkflowExecutionError("Failed to queue prompt to Comfy Cloud.")
    return str(prompt_id)


def wait_for_cloud_completion(server: dict[str, Any], prompt_id: str) -> None:
    api_key = resolve_cloud_api_key(server)
    base_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
    status_url = f"{base_url}/api/job/{prompt_id}/status"
    deadline = time.time() + CLOUD_TIMEOUT_SECONDS

    while time.time() < deadline:
        payload = cloud_request_json("GET", status_url, api_key)
        status = str(payload.get("status") or "").strip().lower()

        if status in {"completed", "success"}:
            return
        if status in {"error", "failed", "cancelled"}:
            raise WorkflowExecutionError(f"Comfy Cloud job '{prompt_id}' failed with status: {status}")

        time.sleep(CLOUD_POLL_INTERVAL_SECONDS)

    raise WorkflowExecutionError(f"Comfy Cloud job '{prompt_id}' did not complete within {CLOUD_TIMEOUT_SECONDS}s")


def find_history_entry(payload: Any, prompt_id: str) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        if "outputs" in payload:
            return payload

        nested = payload.get(prompt_id)
        if isinstance(nested, dict):
            return nested

        for key in ("items", "history", "results", "jobs"):
            entry = find_history_entry(payload.get(key), prompt_id)
            if entry is not None:
                return entry

        payload_prompt_id = payload.get("prompt_id") or payload.get("id")
        if str(payload_prompt_id or "") == prompt_id:
            return payload

        return None

    if isinstance(payload, list):
        for item in payload:
            entry = find_history_entry(item, prompt_id)
            if entry is not None:
                return entry
    return None


def get_cloud_history(server: dict[str, Any], prompt_id: str) -> dict[str, Any]:
    api_key = resolve_cloud_api_key(server)
    base_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
    direct_url = f"{base_url}/api/history_v2/{prompt_id}"

    try:
        response = requests.get(direct_url, headers=cloud_headers(api_key), timeout=60)
    except requests.RequestException as exc:
        raise WorkflowExecutionError(f"Error retrieving Cloud history for '{prompt_id}': {exc}") from exc

    if response.status_code == 404:
        try:
            response = requests.get(
                f"{base_url}/api/history_v2",
                headers=cloud_headers(api_key),
                params={"max_items": 100},
                timeout=60,
            )
        except requests.RequestException as exc:
            raise WorkflowExecutionError(f"Error retrieving Cloud history list for '{prompt_id}': {exc}") from exc

    if not response.ok:
        raise WorkflowExecutionError(build_error_message(response, f"Failed to retrieve Comfy Cloud history for '{prompt_id}'"))

    payload = response.json() if response.content else {}
    history_entry = find_history_entry(payload, prompt_id)
    if history_entry is None:
        raise WorkflowExecutionError(f"Completed Comfy Cloud job '{prompt_id}' has no retrievable history entry")
    return history_entry


def iter_output_files(outputs: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    entries: list[tuple[str, dict[str, Any]]] = []
    for node_id, node_output in outputs.items():
        if not isinstance(node_output, dict):
            continue
        for key in ("images", "video", "audio"):
            for file_info in node_output.get(key, []) or []:
                if isinstance(file_info, dict):
                    entries.append((str(node_id), file_info))
    return entries


def download_local_output_file(server_url: str, file_info: dict[str, Any]) -> bytes:
    params = {
        "filename": file_info["filename"],
        "subfolder": file_info.get("subfolder", ""),
        "type": file_info.get("type", "output"),
    }
    try:
        response = requests.get(f"{server_url.rstrip('/')}/view", params=params, timeout=120)
    except requests.RequestException as exc:
        raise WorkflowExecutionError(f"Failed to download local output '{file_info.get('filename')}': {exc}") from exc

    if not response.ok:
        raise WorkflowExecutionError(build_error_message(response, f"Failed to download local output '{file_info.get('filename')}'"))
    return response.content


def download_cloud_output_file(server: dict[str, Any], file_info: dict[str, Any]) -> bytes:
    api_key = resolve_cloud_api_key(server)
    base_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
    params = {
        "filename": file_info["filename"],
        "subfolder": file_info.get("subfolder", ""),
        "type": file_info.get("type", "output"),
    }

    try:
        response = requests.get(
            f"{base_url}/api/view",
            headers=cloud_headers(api_key),
            params=params,
            allow_redirects=False,
            timeout=120,
        )
    except requests.RequestException as exc:
        raise WorkflowExecutionError(f"Failed to request Cloud output '{file_info.get('filename')}': {exc}") from exc

    if response.status_code in {301, 302, 303, 307, 308}:
        signed_url = response.headers.get("location")
        if not signed_url:
            raise WorkflowExecutionError(f"Comfy Cloud output '{file_info.get('filename')}' did not return a signed download URL")
        try:
            file_response = requests.get(signed_url, timeout=120)
        except requests.RequestException as exc:
            raise WorkflowExecutionError(f"Failed to fetch redirected Cloud output '{file_info.get('filename')}': {exc}") from exc
        if not file_response.ok:
            raise WorkflowExecutionError(build_error_message(file_response, f"Failed to fetch Cloud output '{file_info.get('filename')}'"))
        return file_response.content

    if not response.ok:
        raise WorkflowExecutionError(build_error_message(response, f"Failed to download Cloud output '{file_info.get('filename')}'"))
    return response.content


def save_output_files(
    output_dir: Path,
    prompt_id: str,
    outputs: dict[str, Any],
    downloader,
) -> list[str]:
    downloaded_files: list[str] = []
    for node_id, file_info in iter_output_files(outputs):
        filename = str(file_info.get("filename") or "").strip()
        if not filename:
            continue
        file_bytes = downloader(file_info)
        local_path = output_dir / f"{prompt_id}_{node_id}_{filename}"
        local_path.write_bytes(file_bytes)
        downloaded_files.append(str(local_path))
    return downloaded_files


def run_local_workflow(server: dict[str, Any], workflow_data: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    server_url = str(server.get("url") or "http://127.0.0.1:8188").rstrip("/")
    prompt_id = queue_local_prompt(server_url, workflow_data)
    history_entry = wait_for_local_completion(server_url, prompt_id)
    outputs = history_entry.get("outputs")
    if not isinstance(outputs, dict):
        raise WorkflowExecutionError("No outputs found in local job execution.")

    downloaded_files = save_output_files(
        output_dir=output_dir,
        prompt_id=prompt_id,
        outputs=outputs,
        downloader=lambda file_info: download_local_output_file(server_url, file_info),
    )
    return {"prompt_id": prompt_id, "downloads": downloaded_files}


def run_cloud_workflow(server: dict[str, Any], workflow_data: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    prompt_id = queue_cloud_prompt(server, workflow_data)
    wait_for_cloud_completion(server, prompt_id)
    history_entry = get_cloud_history(server, prompt_id)
    outputs = history_entry.get("outputs")
    if not isinstance(outputs, dict):
        raise WorkflowExecutionError("No outputs found in Comfy Cloud job execution.")

    downloaded_files = save_output_files(
        output_dir=output_dir,
        prompt_id=prompt_id,
        outputs=outputs,
        downloader=lambda file_info: download_cloud_output_file(server, file_info),
    )
    return {"prompt_id": prompt_id, "downloads": downloaded_files}


def main() -> None:
    parser = argparse.ArgumentParser(description="ComfyUI Client for OpenClaw Skill")
    parser.add_argument(
        "--workflow",
        required=True,
        help="Workflow identifier: '<server_id>/<workflow_id>' or just '<workflow_id>' (resolves a healthy target across servers)",
    )
    parser.add_argument("--args", required=True, help="JSON string of parameter key-values mapping to the schema")
    args = parser.parse_args()

    try:
        requested_server_id, workflow_id = parse_workflow_arg(args.workflow)
        if requested_server_id is not None and not is_valid_identifier(requested_server_id):
            raise WorkflowExecutionError("Invalid server id in --workflow")
        if not is_valid_identifier(workflow_id):
            raise WorkflowExecutionError("Invalid workflow id in --workflow")

        server_id, resolved_workflow_id, resolution = resolve_workflow_target(requested_server_id, workflow_id)
        server = get_server_by_id(server_id)
        if not server:
            raise WorkflowExecutionError(f"Server '{server_id}' not found in config.json")
        if not server.get("enabled", True):
            raise WorkflowExecutionError(f"Server '{server_id}' is disabled")

        input_args = parse_input_args(args.args)
        workflow_data, schema_data = load_workflow_bundle(server_id, resolved_workflow_id)

        if not schema_data.get("enabled", True):
            raise WorkflowExecutionError(f"Workflow '{resolved_workflow_id}' is disabled on server '{server_id}'")

        parameters = schema_data.get("parameters", {})
        if not isinstance(parameters, dict):
            raise WorkflowExecutionError(f"Schema '{workflow_id}' has an invalid parameters section")

        apply_input_args(workflow_data, parameters, input_args)
        output_dir = ensure_output_dir(server)
        server_type = str(server.get("server_type") or DEFAULT_SERVER_TYPE).strip() or DEFAULT_SERVER_TYPE

        if server_type == COMFY_CLOUD_SERVER_TYPE:
            result = run_cloud_workflow(server, workflow_data, output_dir)
        else:
            result = run_local_workflow(server, workflow_data, output_dir)

        print(json.dumps({
            "status": "success",
            "requested_workflow": args.workflow,
            "workflow_id": workflow_id,
            "resolved_workflow_id": resolved_workflow_id,
            "server": server_id,
            "server_type": server_type,
            "selection_reason": resolution["selection_reason"],
            "prompt_id": result["prompt_id"],
            "images": result["downloads"],
        }))
    except WorkflowExecutionError as exc:
        print(json.dumps({"error": str(exc)}))


if __name__ == "__main__":
    main()
