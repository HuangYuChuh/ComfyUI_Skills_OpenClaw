#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from registry import inspect_workflows
from shared.config import COMFY_CLOUD_SERVER_TYPE, DEFAULT_COMFY_CLOUD_URL, DEFAULT_SERVER_TYPE
from shared.runtime_config import get_runtime_config


def build_check(level: str, code: str, message: str, **context: Any) -> dict[str, Any]:
    payload = {"level": level, "code": code, "message": message}
    payload.update(context)
    return payload


def resolve_cloud_api_key(server: dict[str, Any]) -> tuple[str, str | None]:
    direct_key = str(server.get("api_key") or "").strip()
    if direct_key:
        return direct_key, None

    env_name = str(server.get("api_key_env") or "").strip()
    if env_name:
        env_value = os.environ.get(env_name, "").strip()
        if env_value:
            return env_value, None
        return "", env_name

    fallback = os.environ.get("COMFY_CLOUD_API_KEY", "").strip()
    if fallback:
        return fallback, None
    return "", None


def probe_local_server(server: dict[str, Any]) -> dict[str, Any]:
    server_url = str(server.get("url") or "").rstrip("/")
    if not server_url:
        return build_check("error", "server_url_missing", f"Server '{server.get('id')}' has no URL configured")

    try:
        response = requests.get(f"{server_url}/queue", timeout=8)
    except requests.RequestException as exc:
        return build_check("error", "server_unreachable", f"Failed to connect to '{server_url}': {exc}", server_id=server.get("id"))

    if not response.ok:
        return build_check(
            "error",
            "server_http_error",
            f"Local server '{server.get('id')}' responded with HTTP {response.status_code}",
            server_id=server.get("id"),
            status_code=response.status_code,
        )

    return build_check("ok", "server_reachable", f"Local server '{server.get('id')}' is reachable", server_id=server.get("id"))


def probe_cloud_server(server: dict[str, Any]) -> dict[str, Any]:
    server_url = str(server.get("url") or DEFAULT_COMFY_CLOUD_URL).rstrip("/")
    api_key, missing_env = resolve_cloud_api_key(server)
    if missing_env:
        return build_check(
            "error",
            "cloud_api_key_env_missing",
            f"Cloud server '{server.get('id')}' expects env var '{missing_env}', but it is not set",
            server_id=server.get("id"),
        )
    if not api_key:
        return build_check("error", "cloud_api_key_missing", f"Cloud server '{server.get('id')}' has no usable API key", server_id=server.get("id"))

    try:
        response = requests.get(f"{server_url}/api/user", headers={"X-API-Key": api_key}, timeout=8)
    except requests.RequestException as exc:
        return build_check("error", "cloud_unreachable", f"Failed to connect to '{server_url}': {exc}", server_id=server.get("id"))

    if not response.ok:
        return build_check(
            "error",
            "cloud_http_error",
            f"Cloud server '{server.get('id')}' responded with HTTP {response.status_code}",
            server_id=server.get("id"),
            status_code=response.status_code,
        )

    return build_check("ok", "cloud_reachable", f"Cloud server '{server.get('id')}' is reachable", server_id=server.get("id"))


def inspect_servers(config: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    servers = config.get("servers", [])

    if not servers:
        checks.append(build_check("error", "no_servers", "No servers configured in config.json"))
        return checks

    enabled_servers = [server for server in servers if server.get("enabled", True)]
    if not enabled_servers:
        checks.append(build_check("error", "no_enabled_servers", "All configured servers are disabled"))

    for server in servers:
        server_id = str(server.get("id") or "")
        server_type = str(server.get("server_type") or DEFAULT_SERVER_TYPE).strip() or DEFAULT_SERVER_TYPE
        enabled = bool(server.get("enabled", True))

        if not server_id:
            checks.append(build_check("error", "server_id_missing", "A server entry is missing an id"))
            continue

        if not enabled:
            checks.append(build_check("warning", "server_disabled", f"Server '{server_id}' is disabled", server_id=server_id))
            continue

        if server_type == COMFY_CLOUD_SERVER_TYPE:
            checks.append(probe_cloud_server(server))
        else:
            checks.append(probe_local_server(server))

    return checks


def determine_status(checks: list[dict[str, Any]], workflow_report: dict[str, Any]) -> str:
    if any(check["level"] == "error" for check in checks):
        return "error"
    if workflow_report["summary"]["visible_workflow_count"] == 0:
        return "warning"
    if workflow_report["summary"]["warning_count"] > 0:
        return "warning"
    return "ok"


def print_human_report(status: str, checks: list[dict[str, Any]], workflow_report: dict[str, Any]) -> None:
    print(f"\nSkill Doctor Status: {status.upper()}")
    print("=" * 60)

    print("Server checks:")
    for check in checks:
        print(f"  - {check['level'].upper()}: {check['message']}")

    summary = workflow_report["summary"]
    print("\nWorkflow summary:")
    print(f"  - servers: {summary['server_count']}")
    print(f"  - workflows discovered from schemas: {summary['workflow_count']}")
    print(f"  - workflows visible to the agent: {summary['visible_workflow_count']}")
    print(f"  - issues: {summary['issue_count']}")

    if workflow_report["issues"]:
        print("\nWorkflow issues:")
        for issue in workflow_report["issues"]:
            print(f"  - {issue['level'].upper()}: {issue['message']}")

    invisible_workflows = [workflow for workflow in workflow_report["workflows"] if not workflow["_visible"]]
    if invisible_workflows:
        print("\nHidden workflows:")
        for workflow in invisible_workflows:
            reasons = ", ".join(workflow["_reasons"]) or "unknown"
            print(f"  - {workflow['server_id']}/{workflow['workflow_id']}: {reasons}")

    print("=" * 60 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose OpenClaw skill readiness")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    config = get_runtime_config()
    checks = inspect_servers(config)
    workflow_report = inspect_workflows()
    status = determine_status(checks, workflow_report)

    if args.json:
        print(json.dumps({
            "status": status,
            "checks": checks,
            "workflow_report": workflow_report,
        }, ensure_ascii=False, indent=2))
        return

    print_human_report(status, checks, workflow_report)
    if status == "error":
        sys.exit(1)


if __name__ == "__main__":
    main()
