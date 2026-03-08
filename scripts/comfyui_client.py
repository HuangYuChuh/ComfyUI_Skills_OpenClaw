import os
import json
import uuid
import time
import argparse
import urllib.request
import urllib.parse
from logging import getLogger

from shared.json_utils import load_json
from shared.runtime_config import get_runtime_config

logger = getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS_DIR = os.path.join(BASE_DIR, "data", "workflows")
SCHEMAS_DIR = os.path.join(BASE_DIR, "data", "schemas")

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
    parser.add_argument("--workflow", required=True, help="Name of the workflow (e.g. sd15_txt2img)")
    parser.add_argument("--args", required=True, help="JSON string of parameter key-values mapping to the schema")
    
    args = parser.parse_args()
    
    # 1. Load config
    config = get_runtime_config()
    server_url = config.get("comfyui_server_url", "http://127.0.0.1:8188")
    output_dir = config.get("output_dir", os.path.join(BASE_DIR, "outputs"))
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
        
    # 2. Parse input arguments
    try:
        input_args = json.loads(args.args)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON format for --args"}))
        return

    # 3. Load Workflow and Schema
    wf_path = os.path.join(WORKFLOWS_DIR, f"{args.workflow}.json")
    schema_path = os.path.join(SCHEMAS_DIR, f"{args.workflow}.json")
    
    if not os.path.exists(wf_path):
        print(json.dumps({"error": f"Workflow {args.workflow}.json not found in {WORKFLOWS_DIR}"}))
        return
        
    if not os.path.exists(schema_path):
        print(json.dumps({"error": f"Schema {args.workflow}.json not found in {SCHEMAS_DIR}"}))
        return
        
    workflow_data = load_json(wf_path)
    schema_data = load_json(schema_path)
    parameters = schema_data.get("parameters", {})
    
    # 4. Map parameters to workflow nodes
    for key, value in input_args.items():
        if key in parameters:
            node_id = str(parameters[key]["node_id"])
            field = parameters[key]["field"]
            if node_id in workflow_data and "inputs" in workflow_data[node_id]:
                # Automatically convert type if necessary based on schema
                param_type = parameters[key].get("type", "string")
                if param_type == "int":
                    value = int(value)
                elif param_type == "float":
                    value = float(value)
                elif param_type == "boolean":
                    value = bool(value)
                
                workflow_data[node_id]["inputs"][field] = value
                
    # 5. Queue Prompt
    queue_res = queue_prompt(server_url, workflow_data)
    if not queue_res or 'prompt_id' not in queue_res:
        print(json.dumps({"error": "Failed to queue prompt to ComfyUI."}))
        return
        
    prompt_id = queue_res['prompt_id']
    
    # 6. Poll for completion via history
    # To keep it completely standard-library-only without websockets, we poll /history
    # This works because /history will contain the prompt_id once the job is fully done
    
    while True:
        history = get_history(server_url, prompt_id)
        if history and prompt_id in history:
            job_info = history[prompt_id]
            break
        # Sleep to avoid spamming the server
        time.sleep(2)
        
    # 7. Extract images
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
        "prompt_id": prompt_id,
        "images": downloaded_files
    }))

if __name__ == "__main__":
    main()
