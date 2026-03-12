import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.json_utils import load_json
from shared.config import get_server_schema_path, get_server_workflow_path, list_server_workflow_dirs
from shared.runtime_config import get_runtime_config

REASON_MESSAGES = {
    "server_disabled": "server disabled",
    "workflow_disabled": "workflow disabled",
    "workflow_missing": "workflow file missing",
    "invalid_schema": "schema invalid",
}


def normalize_parameter_info(param_info: dict[str, Any]) -> dict[str, Any]:
    parameter = {
        "type": param_info.get("type", "string"),
        "required": bool(param_info.get("required", False)),
        "description": param_info.get("description", ""),
    }

    if "default" in param_info:
        parameter["default"] = param_info.get("default")
    if "example" in param_info:
        parameter["example"] = param_info.get("example")

    choices = param_info.get("choices")
    if isinstance(choices, list) and choices:
        parameter["choices"] = choices
    elif isinstance(param_info.get("enum"), list) and param_info["enum"]:
        parameter["choices"] = param_info["enum"]

    return parameter


def build_issue(level: str, code: str, message: str, **context: Any) -> dict[str, Any]:
    issue = {
        "level": level,
        "code": code,
        "message": message,
    }
    issue.update(context)
    return issue


def inspect_workflows() -> dict[str, Any]:
    config = get_runtime_config()
    servers = config.get("servers", [])
    workflows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []

    for server in servers:
        server_id = str(server.get("id", "") or "")
        server_name = str(server.get("name", server_id) or server_id)
        server_enabled = bool(server.get("enabled", True))

        workflow_dirs = list_server_workflow_dirs(server_id)

        if not workflow_dirs:
            issues.append(build_issue(
                "warning",
                "missing_schema_dir",
                f"Schema directory does not exist for server '{server_id}'",
                server_id=server_id,
                path=str(server_id),
            ))
            continue

        for workflow_dir in workflow_dirs:
            workflow_id = workflow_dir.name
            schema_path = get_server_schema_path(server_id, workflow_id)
            workflow_path = get_server_workflow_path(server_id, workflow_id)
            reasons: list[str] = []
            description = "No description provided."
            parameters: dict[str, Any] = {}
            workflow_enabled = True
            schema_valid = True
            origin = "local_upload"
            source_label = "Local Upload"
            tags: list[str] = []

            try:
                schema_data = load_json(schema_path)
                if not isinstance(schema_data, dict):
                    raise ValueError("Schema root must be a JSON object")

                workflow_id = str(schema_data.get("workflow_id") or workflow_id)
                workflow_path = get_server_workflow_path(server_id, workflow_id)
                workflow_enabled = bool(schema_data.get("enabled", True))
                description = str(schema_data.get("description") or "").strip() or "No description provided."

                raw_parameters = schema_data.get("parameters", {})
                if not isinstance(raw_parameters, dict):
                    raise ValueError("Schema 'parameters' must be a JSON object")

                origin = str(schema_data.get("origin") or "local_upload").strip() or "local_upload"
                source_label = str(schema_data.get("source_label") or "Local Upload").strip() or "Local Upload"
                tags = [str(tag).strip() for tag in schema_data.get("tags", []) if str(tag).strip()]

                for param_key, param_info in raw_parameters.items():
                    if not isinstance(param_info, dict):
                        raise ValueError(f"Parameter '{param_key}' must be a JSON object")
                    parameters[str(param_key)] = normalize_parameter_info(param_info)
            except Exception as exc:
                schema_valid = False
                reasons.append("invalid_schema")
                description = "Invalid schema."
                issues.append(build_issue(
                    "error",
                    "invalid_schema",
                    f"Failed to load schema '{schema_path.name}': {exc}",
                    server_id=server_id,
                    workflow_id=workflow_id,
                    path=str(schema_path),
                ))

            if not server_enabled:
                reasons.append("server_disabled")
            if schema_valid and not workflow_enabled:
                reasons.append("workflow_disabled")
            if not workflow_path.exists():
                reasons.append("workflow_missing")
                issues.append(build_issue(
                    "warning",
                    "workflow_missing",
                    f"Workflow file '{workflow_path.name}' is missing for schema '{schema_path.name}'",
                    server_id=server_id,
                    workflow_id=workflow_id,
                    path=str(workflow_path),
                ))

            deduped_reasons = []
            seen_reasons = set()
            for reason in reasons:
                if reason in seen_reasons:
                    continue
                seen_reasons.add(reason)
                deduped_reasons.append(reason)

            workflows.append({
                "logical_workflow_id": str(schema_data.get("logical_workflow_id") or workflow_id) if schema_valid else workflow_id,
                "server_id": server_id,
                "server_name": server_name,
                "workflow_id": workflow_id,
                "deployment_workflow_id": workflow_id,
                "description": description,
                "parameters": parameters,
                "origin": origin,
                "source_label": source_label,
                "tags": tags,
                "_server_enabled": server_enabled,
                "_workflow_enabled": workflow_enabled,
                "_schema_valid": schema_valid,
                "_schema_path": str(schema_path),
                "_workflow_path": str(workflow_path),
                "_workflow_exists": workflow_path.exists(),
                "_visible": not deduped_reasons,
                "_reasons": deduped_reasons,
            })

    visible_count = sum(1 for workflow in workflows if workflow["_visible"])
    logical_workflow_count = len({workflow["logical_workflow_id"] for workflow in workflows})
    visible_logical_workflow_count = len({workflow["logical_workflow_id"] for workflow in workflows if workflow["_visible"]})
    summary = {
        "server_count": len(servers),
        "workflow_count": len(workflows),
        "visible_workflow_count": visible_count,
        "logical_workflow_count": logical_workflow_count,
        "visible_logical_workflow_count": visible_logical_workflow_count,
        "issue_count": len(issues),
        "error_count": sum(1 for issue in issues if issue["level"] == "error"),
        "warning_count": sum(1 for issue in issues if issue["level"] == "warning"),
    }

    return {
        "workflows": workflows,
        "issues": issues,
        "summary": summary,
    }


def select_preferred_workflow_target(workflows: list[dict[str, Any]], prefer_server_id: str = "") -> dict[str, Any]:
    visible_workflows = [workflow for workflow in workflows if workflow.get("_visible")]
    candidates = visible_workflows or workflows
    if not candidates:
        raise ValueError("At least one workflow target is required")

    sorted_candidates = sorted(
        candidates,
        key=lambda workflow: (
            0 if workflow.get("server_id") == prefer_server_id else 1,
            0 if workflow.get("_visible") else 1,
            str(workflow.get("server_id") or "").lower(),
        ),
    )
    return sorted_candidates[0]


def build_logical_workflow_catalog(report: dict[str, Any], include_all: bool = False, include_debug: bool = False) -> list[dict[str, Any]]:
    config = get_runtime_config()
    prefer_server_id = str(config.get("default_server") or "").strip()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for workflow in report["workflows"]:
        if not include_all and not workflow["_visible"]:
            continue
        grouped.setdefault(str(workflow.get("logical_workflow_id") or workflow["workflow_id"]), []).append(workflow)

    catalog: list[dict[str, Any]] = []
    for logical_workflow_id in sorted(grouped.keys(), key=str.lower):
        targets = grouped[logical_workflow_id]
        preferred = select_preferred_workflow_target(targets, prefer_server_id=prefer_server_id)
        parameter_source = next((target for target in targets if target.get("parameters")), preferred)
        sorted_targets = sorted(targets, key=lambda target: (0 if target["server_id"] == prefer_server_id else 1, target["server_id"]))

        payload = {
            "workflow_id": logical_workflow_id,
            "server_id": preferred["server_id"],
            "server_name": preferred["server_name"],
            "description": preferred["description"],
            "parameters": parameter_source.get("parameters", {}),
            "origin": preferred.get("origin", "local_upload"),
            "source_label": preferred.get("source_label", "Local Upload"),
            "tags": preferred.get("tags", []),
            "target_count": len(targets),
            "targets": [
                {
                    "server_id": target["server_id"],
                    "server_name": target["server_name"],
                    "workflow_id": target["deployment_workflow_id"],
                    "origin": target.get("origin", "local_upload"),
                    "source_label": target.get("source_label", "Local Upload"),
                    "tags": target.get("tags", []),
                    "visible": bool(target.get("_visible")),
                }
                for target in sorted_targets
            ],
        }

        if include_debug:
            payload["targets"] = [
                {
                    **target_payload,
                    "logical_workflow_id": target.get("logical_workflow_id"),
                    "reasons": list(target.get("_reasons", [])),
                    "schema_path": target.get("_schema_path"),
                    "workflow_path": target.get("_workflow_path"),
                }
                for target_payload, target in zip(payload["targets"], sorted_targets)
            ]

        catalog.append(payload)

    return catalog


def build_agent_workflow_catalog(report: dict[str, Any], include_all: bool = False, include_debug: bool = False) -> list[dict[str, Any]]:
    return build_logical_workflow_catalog(report, include_all=include_all, include_debug=include_debug)


def agent_workflow_payload(workflow: dict[str, Any], include_debug: bool = False) -> dict[str, Any]:
    payload = {
        "server_id": workflow["server_id"],
        "server_name": workflow["server_name"],
        "workflow_id": workflow["workflow_id"],
        "description": workflow["description"],
        "parameters": workflow.get("parameters", {}),
        "origin": workflow.get("origin", "local_upload"),
        "source_label": workflow.get("source_label", "Local Upload"),
        "tags": workflow.get("tags", []),
    }
    if include_debug:
        payload["visible"] = workflow["_visible"]
        payload["reasons"] = workflow["_reasons"]
        payload["schema_path"] = workflow["_schema_path"]
        payload["workflow_path"] = workflow["_workflow_path"]
    return payload


def print_agent_output(report: dict[str, Any], include_all: bool = False, include_debug: bool = False) -> None:
    payload = {
        "status": "success",
        "workflows": build_agent_workflow_catalog(report, include_all=include_all, include_debug=include_debug),
    }
    if include_debug:
        payload["summary"] = report["summary"]
        payload["issues"] = report["issues"]

    print(json.dumps(payload, ensure_ascii=False, indent=2))


def print_human_output(report: dict[str, Any], include_all: bool = False) -> None:
    workflows = report["workflows"]
    print("\nInstalled Workflows:")
    print("=" * 50)
    if not workflows:
        print("  (No workflows found)")
    else:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for workflow in workflows:
            grouped.setdefault(workflow["server_id"], []).append(workflow)

        for server_id, server_workflows in grouped.items():
            server_name = server_workflows[0]["server_name"]
            server_enabled = server_workflows[0]["_server_enabled"]
            server_status = "" if server_enabled else " (disabled)"
            print(f"\n  [{server_name}]{server_status}")
            print(f"  {'-' * 40}")

            printed_any = False
            for workflow in server_workflows:
                if not include_all and not workflow["_visible"]:
                    continue
                printed_any = True
                desc_text = ""
                if workflow["description"] and workflow["description"] != "No description provided.":
                    desc_text = f" - {workflow['description']}"
                status_suffix = ""
                if workflow["_reasons"]:
                    status_suffix = f" [{', '.join(REASON_MESSAGES.get(reason, reason) for reason in workflow['_reasons'])}]"
                print(f"    {workflow['workflow_id']}{desc_text}{status_suffix}")

            if not printed_any:
                print("    (No visible workflows)")

    print("\n" + "=" * 50)

    if report["issues"]:
        print("Warnings / Errors:")
        for issue in report["issues"]:
            print(f"  - {issue['level'].upper()}: {issue['message']}")
        print("=" * 50)

    print("Tip: Use '--agent --debug' for JSON diagnostics or '--all' to include hidden workflows.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Workflow Registry for OpenClaw Skill")
    parser.add_argument("action", choices=["list"], help="Action to perform")
    parser.add_argument("--agent", action="store_true", help="Output JSON schema for agent parsing")
    parser.add_argument("--all", action="store_true", help="Include hidden or invalid workflows in the output")
    parser.add_argument("--debug", action="store_true", help="Include issues and visibility reasons in JSON output")

    args = parser.parse_args()
    if args.action != "list":
        return

    report = inspect_workflows()
    if args.agent:
        print_agent_output(report, include_all=args.all, include_debug=args.debug)
        return

    print_human_output(report, include_all=args.all)


if __name__ == "__main__":
    main()
