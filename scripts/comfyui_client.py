import os
import json
import uuid
import time
import argparse
import urllib.request
import urllib.parse
import sys
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


def queue_prompt(server_url, prompt_workflow):
    data = json.dumps({"prompt": prompt_workflow, "client_id": str(uuid.uuid4())}).encode('utf-8')
    req = urllib.request.Request(f"{server_url}/prompt", data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.URLError as e:
        print(f"Error connecting to ComfyUI ({server_url}): {e}")
        return None


def get_history(server_url, prompt_id):
    req = urllib.request.Request(f"{server_url}/history/{prompt_id}")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.URLError:
        return None


def get_image(server_url, filename, subfolder, folder_type):
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    req = urllib.request.Request(f"{server_url}/view?{url_values}")
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

    # 5. Map parameters to workflow nodes
    for key, value in input_args.items():
        if key in parameters:
            node_id = str(parameters[key]["node_id"])
            field = parameters[key]["field"]
            if node_id in workflow_data and "inputs" in workflow_data[node_id]:
                param_type = parameters[key].get("type", "string")
                if param_type == "int":
                    value = int(value)
                elif param_type == "float":
                    value = float(value)
                elif param_type == "boolean":
                    value = bool(value)

                workflow_data[node_id]["inputs"][field] = value

    # 6. Queue Prompt
    queue_res = queue_prompt(server_url, workflow_data)
    if not queue_res or 'prompt_id' not in queue_res:
        print(json.dumps({"error": "Failed to queue prompt to ComfyUI."}))
        return

    prompt_id = queue_res['prompt_id']

    # 7. Poll for completion via history
    while True:
        history = get_history(server_url, prompt_id)
        if history and prompt_id in history:
            job_info = history[prompt_id]
            break
        time.sleep(2)

    # 8. Extract images
    if 'outputs' not in job_info:
        print(json.dumps({"error": "No outputs found in job execution."}))
        return

    downloaded_files = []

    for node_id, node_output in job_info['outputs'].items():
        if 'images' in node_output:
            for image in node_output['images']:
                filename = image['filename']
                subfolder = image.get('subfolder', '')
                folder_type = image.get('type', 'output')

                img_data = get_image(server_url, filename, subfolder, folder_type)
                if img_data:
                    local_filepath = os.path.join(output_dir, f"{prompt_id}_{node_id}_{filename}")
                    with open(local_filepath, "wb") as f:
                        f.write(img_data)
                    downloaded_files.append(local_filepath)

    # Output the JSON result
    print(json.dumps({
        "status": "success",
        "server": server_id,
        "prompt_id": prompt_id,
        "images": downloaded_files,
    }))


if __name__ == "__main__":
    main()
