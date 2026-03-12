#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.cloud_templates import CloudTemplateError
from ui.services import UIStorageService


def print_templates(templates: list[dict[str, object]]) -> None:
    if not templates:
        print("(No templates found)")
        return

    for template in templates:
        installed = " [installed]" if template.get("installed") else ""
        print(f"- {template.get('id')} :: {template.get('name')}{installed}")
        description = str(template.get("description") or "").strip()
        if description:
            print(f"  {description}")
        tags = template.get("tags") or []
        if isinstance(tags, list) and tags:
            print(f"  tags: {', '.join(str(tag) for tag in tags)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Comfy Cloud template tools")
    subparsers = parser.add_subparsers(dest="command")

    list_parser = subparsers.add_parser("list", help="List bundled or official Cloud templates")
    list_parser.add_argument("--source", choices=["bundled", "official"], required=True)
    list_parser.add_argument("--server", help="Optional server id to annotate installed templates")
    list_parser.add_argument("--json", action="store_true", help="Print JSON output")

    import_parser = subparsers.add_parser("import", help="Import a Cloud template into a server")
    import_parser.add_argument("--server", required=True, help="Target server id")
    import_parser.add_argument("--source", choices=["bundled", "official"], required=True)
    import_parser.add_argument("--template", required=True, help="Template id")
    import_parser.add_argument("--workflow-id", help="Override the installed workflow id")
    import_parser.add_argument("--overwrite", action="store_true", help="Overwrite an existing workflow if needed")

    defaults_parser = subparsers.add_parser("install-defaults", help="Install the bundled Cloud starter set")
    defaults_parser.add_argument("--server", required=True, help="Target server id")
    defaults_parser.add_argument("--json", action="store_true", help="Print JSON output")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    service = UIStorageService()

    try:
        if args.command == "list":
            templates = (
                service.list_bundled_cloud_templates(args.server)
                if args.source == "bundled"
                else service.list_official_cloud_templates(args.server)
            )
            if args.json:
                print(json.dumps({"templates": templates}, ensure_ascii=False, indent=2))
            else:
                print_templates(templates)
            return

        if args.command == "import":
            payload = service.import_cloud_template(
                server_id=args.server,
                source=args.source,
                template_id=args.template,
                workflow_id=args.workflow_id,
                overwrite_existing=args.overwrite,
            )
            print(json.dumps({"status": "success", **payload}, ensure_ascii=False, indent=2))
            return

        if args.command == "install-defaults":
            installed = service.install_default_bundled_templates(args.server, overwrite=False)
            payload = {"status": "success", "installed": installed}
            if args.json:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                print(f"Installed {len(installed)} bundled Cloud workflows to server '{args.server}'.")
                for item in installed:
                    print(f"- {item.get('workflow_id')}")
            return
    except FileExistsError as exc:
        print(json.dumps({"error": f"Workflow '{exc}' already exists"}, ensure_ascii=False))
        raise SystemExit(1) from exc
    except (CloudTemplateError, FileNotFoundError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
