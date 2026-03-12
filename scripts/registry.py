import os
import json
import argparse

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.config import get_server_schema_path, list_server_workflow_dirs
from shared.runtime_config import get_runtime_config


def get_workflows(is_agent=False):
    config = get_runtime_config()
    servers = config.get("servers", [])
    all_workflows = []

    for server in servers:
        server_id = server.get("id", "")
        server_name = server.get("name", server_id)
        server_enabled = server.get("enabled", True)

        workflow_dirs = list_server_workflow_dirs(server_id)

        if not workflow_dirs:
            if not is_agent and server_enabled:
                all_workflows.append({
                    "_server_id": server_id,
                    "_server_name": server_name,
                    "_server_enabled": server_enabled,
                    "_empty": True,
                })
            continue

        for workflow_dir in workflow_dirs:
            workflow_id = workflow_dir.name
            filepath = get_server_schema_path(server_id, workflow_id)
            if not filepath.exists():
                continue
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    schema_data = json.load(f)

                workflow_enabled = schema_data.get("enabled", True)
                desc = schema_data.get("description", "")

                # Apply dual-layer switch logic
                visible = server_enabled and workflow_enabled

                workflow_info = {
                    "_server_id": server_id,
                    "_server_name": server_name,
                    "_server_enabled": server_enabled,
                    "_workflow_enabled": workflow_enabled,
                    "server_id": server_id,
                    "server_name": server_name,
                    "workflow_id": workflow_id,
                    "description": desc or "No description provided.",
                    "_visible": visible,
                }

                if is_agent:
                    # Agent only sees visible workflows
                    if not visible:
                        continue
                    workflow_info["parameters"] = {}
                    for param_key, param_info in schema_data.get("parameters", {}).items():
                        workflow_info["parameters"][param_key] = {
                            "type": param_info.get("type", "string"),
                            "required": param_info.get("required", False),
                            "description": param_info.get("description", ""),
                        }

                all_workflows.append(workflow_info)
            except Exception:
                pass

    if is_agent:
        # Clean internal fields
        output = []
        for wf in all_workflows:
            output.append({
                "server_id": wf["server_id"],
                "server_name": wf["server_name"],
                "workflow_id": wf["workflow_id"],
                "description": wf["description"],
                "parameters": wf.get("parameters", {}),
            })
        print(json.dumps({
            "status": "success",
            "workflows": output,
        }, ensure_ascii=False, indent=2))
    else:
        # Human-readable output
        print("\nInstalled Workflows:")
        print("=" * 50)
        if not all_workflows:
            print("  (No workflows found)")
        else:
            current_server = None
            for wf in all_workflows:
                sid = wf.get("_server_id", "")
                sname = wf.get("_server_name", sid)
                if sid != current_server:
                    current_server = sid
                    status = "" if wf.get("_server_enabled", True) else " (disabled)"
                    print(f"\n  [{sname}]{status}")
                    print(f"  {'-' * 40}")

                if wf.get("_empty"):
                    print("    (No workflows)")
                    continue

                wf_id = wf.get("workflow_id", "")
                if not wf.get("_workflow_enabled", True):
                    print(f"    {wf_id} (disabled)")
                else:
                    desc = wf.get("description", "")
                    desc_text = f" - {desc}" if desc and desc != "No description provided." else ""
                    print(f"    {wf_id}{desc_text}")
        print("\n" + "=" * 50)
        print("Tip: Use '--agent' flag to view full JSON schema.\n")


def main():
    parser = argparse.ArgumentParser(description="Workflow Registry for OpenClaw Skill")
    parser.add_argument("action", choices=["list"], help="Action to perform")
    parser.add_argument("--agent", action="store_true", help="Output full JSON schema for Agent parsing")

    args = parser.parse_args()
    if args.action == "list":
        get_workflows(is_agent=args.agent)


if __name__ == "__main__":
    main()
