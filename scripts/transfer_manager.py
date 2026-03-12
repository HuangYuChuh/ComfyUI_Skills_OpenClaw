#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.transfer_bundle import (  # noqa: E402
    BundleValidationError,
    apply_bundle_import,
    build_export_bundle,
    preview_bundle_import,
)


def _write_output_bundle(output_path: Path, bundle: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(bundle, file, ensure_ascii=False, indent=2)
        file.write("\n")


def _read_input_bundle(input_path: Path) -> dict:
    with input_path.open("r", encoding="utf-8") as file:
        loaded = json.load(file)
    if not isinstance(loaded, dict):
        raise ValueError("Bundle file must contain a JSON object.")
    return loaded


def _print_preview(prefix: str, payload: Any) -> None:
    print(f"{prefix}:")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def cmd_export(args: argparse.Namespace) -> int:
    output_path = Path(args.output).expanduser()
    bundle, warnings = build_export_bundle(portable_only=args.portable_only)
    _write_output_bundle(output_path, bundle)

    print(f"Bundle exported to: {output_path}")
    print(
        "Summary:"
        f" servers={len(bundle['portable'].get('servers', []))},"
        f" workflows={len(bundle['portable'].get('workflows', []))},"
        f" warnings={len(warnings)}"
    )
    if warnings:
        _print_preview("Warnings", [warning.to_dict() for warning in warnings])
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser()
    bundle = _read_input_bundle(input_path)
    preview = preview_bundle_import(
        bundle,
        apply_environment=args.apply_environment,
        overwrite_workflows=not args.no_overwrite,
    )

    if not preview.validation.valid:
        _print_preview("Validation errors", preview.validation.to_dict())
        return 1

    if preview.plan is None:
        print("Import preview could not be generated.")
        return 1

    _print_preview("Import preview", preview.to_dict())
    if args.dry_run:
        return 0

    try:
        report = apply_bundle_import(
            bundle,
            apply_environment=args.apply_environment,
            overwrite_workflows=not args.no_overwrite,
        )
    except BundleValidationError as exc:
        _print_preview("Validation errors", exc.result.to_dict())
        return 1
    except RuntimeError as exc:
        print(str(exc))
        return 1

    _print_preview("Import applied", report.to_dict())
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export or import ComfyUI OpenClaw skill bundles.")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    export_parser = subparsers.add_parser("export", help="Export current config and workflows into a bundle JSON.")
    export_parser.add_argument("--output", required=True, help="Output bundle path, for example ./openclaw-skill-export.json")
    export_parser.add_argument("--portable-only", action="store_true", help="Exclude environment-specific runtime config.")

    import_parser = subparsers.add_parser("import", help="Import a bundle JSON into the current workspace.")
    import_parser.add_argument("--input", required=True, help="Input bundle JSON path.")
    import_parser.add_argument("--dry-run", action="store_true", help="Preview the import plan without writing any files.")
    import_parser.add_argument("--apply-environment", action="store_true", help="Also apply bundle default_server, url, and output_dir.")
    import_parser.add_argument("--no-overwrite", action="store_true", help="Do not overwrite existing workflows with the same id.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 0

    commands = {
        "export": cmd_export,
        "import": cmd_import,
    }
    return commands[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
