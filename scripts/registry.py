import os
import json
import argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMAS_DIR = os.path.join(BASE_DIR, "data", "schemas")

def get_workflows():
    if not os.path.exists(SCHEMAS_DIR):
        print(json.dumps({"error": f"Schema directory not found: {SCHEMAS_DIR}"}))
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
                    
                    # We only expose the necessary structure to the LLM agent
                    # to keep context usage small.
                    workflow_info = {
                        "workflow_id": schema_data.get("workflow_id", filename.replace('.json', '')),
                        "description": schema_data.get("description", "No description provided."),
                        "parameters": {}
                    }
                    
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
                
    print(json.dumps({
        "status": "success",
        "workflows": workflows
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Workflow Registry for OpenClaw Skill")
    parser.add_argument("action", choices=["list"], help="Action to perform")
    
    args = parser.parse_args()
    if args.action == "list":
        get_workflows()

if __name__ == "__main__":
    main()
