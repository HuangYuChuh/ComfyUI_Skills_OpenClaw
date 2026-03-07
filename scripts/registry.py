import os
import json
import argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMAS_DIR = os.path.join(BASE_DIR, "data", "schemas")

def get_workflows(is_agent=False):
    if not os.path.exists(SCHEMAS_DIR):
        if is_agent:
            print(json.dumps({"error": f"Schema directory not found: {SCHEMAS_DIR}"}))
        else:
            print(f"Error: Schema directory not found: {SCHEMAS_DIR}")
        return

    workflows = []
    
    for filename in os.listdir(SCHEMAS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(SCHEMAS_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    schema_data = json.load(f)
                    
                    if not schema_data.get("enabled", True):
                        continue
                    
                    workflow_id = schema_data.get("workflow_id", filename.replace('.json', ''))
                    desc = schema_data.get("description", "")
                    
                    # We only expose the necessary structure to the LLM agent
                    # to keep context usage small.
                    workflow_info = {
                        "workflow_id": workflow_id,
                        "description": desc or "No description provided."
                    }
                    
                    if is_agent:
                        workflow_info["parameters"] = {}
                        for param_key, param_info in schema_data.get("parameters", {}).items():
                            workflow_info["parameters"][param_key] = {
                                "type": param_info.get("type", "string"),
                                "required": param_info.get("required", False),
                                "description": param_info.get("description", "")
                            }
                        
                    workflows.append(workflow_info)
            except Exception as e:
                # Log parsing errors internally but don't break the agent
                pass
                
    if is_agent:
        print(json.dumps({
            "status": "success",
            "workflows": workflows
        }, ensure_ascii=False, indent=2))
    else:
        print("\n📦 Installed Workflows:")
        print("="*40)
        if not workflows:
            print("  (No enabled workflows found)")
        for wf in workflows:
            desc_text = f" - {wf['description']}" if wf['description'] != "No description provided." else ""
            print(f" ✨ {wf['workflow_id']}{desc_text}")
        print("="*40)
        print("Tip: Use 'python scripts/registry.py list --agent' to view full parameter schemas.\n")


def main():
    parser = argparse.ArgumentParser(description="Workflow Registry for OpenClaw Skill")
    parser.add_argument("action", choices=["list"], help="Action to perform")
    parser.add_argument("--agent", action="store_true", help="Output full JSON schema for Agent parsing")
    
    args = parser.parse_args()
    if args.action == "list":
        get_workflows(is_agent=args.agent)

if __name__ == "__main__":
    main()
