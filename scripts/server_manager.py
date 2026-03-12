#!/usr/bin/env python3
"""CLI tool for managing ComfyUI servers in config.json.

Usage:
    python scripts/server_manager.py list
    python scripts/server_manager.py add --id cloud-gpu --name "Cloud GPU" --url http://10.0.0.5:8188
    python scripts/server_manager.py enable <server_id>
    python scripts/server_manager.py disable <server_id>
    python scripts/server_manager.py remove <server_id>
"""

import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.config import CONFIG_PATH
from shared.json_utils import load_json, save_json
from shared.runtime_config import get_runtime_config


def _is_valid_server_id(value: str) -> bool:
    if not value:
        return False
    if value in {".", ".."}:
        return False
    if any(c in value for c in ("/", "\\", " ")):
        return False
    return True


def _load_config() -> dict:
    config = get_runtime_config()
    return config


def _save_config(config: dict) -> None:
    save_json(CONFIG_PATH, config)


def cmd_list(args):
    config = _load_config()
    servers = config.get("servers", [])
    default_id = config.get("default_server", "")

    print("\nConfigured Servers:")
    print("=" * 50)
    if not servers:
        print("  (No servers configured)")
    for s in servers:
        sid = s.get("id", "?")
        name = s.get("name", sid)
        url = s.get("url", "")
        enabled = s.get("enabled", True)
        is_default = " [default]" if sid == default_id else ""
        status = "enabled" if enabled else "disabled"
        print(f"  {name} ({sid}) - {url} [{status}]{is_default}")
    print("=" * 50 + "\n")


def cmd_add(args):
    config = _load_config()
    servers = config.get("servers", [])

    if not _is_valid_server_id(args.id):
        print("Error: Invalid server id. Do not use '/', '\\', spaces, '.' or '..'.")
        sys.exit(1)

    # Check for duplicate ID
    for s in servers:
        if s.get("id") == args.id:
            print(f"Error: Server with id '{args.id}' already exists.")
            sys.exit(1)

    new_server = {
        "id": args.id,
        "name": args.name or args.id,
        "url": args.url,
        "enabled": True,
        "output_dir": args.output_dir or "./outputs",
    }
    servers.append(new_server)
    config["servers"] = servers
    _save_config(config)
    print(f"Server '{args.id}' added successfully.")


def cmd_enable(args):
    config = _load_config()
    for s in config.get("servers", []):
        if s.get("id") == args.server_id:
            s["enabled"] = True
            _save_config(config)
            print(f"Server '{args.server_id}' enabled.")
            return
    print(f"Error: Server '{args.server_id}' not found.")
    sys.exit(1)


def cmd_disable(args):
    config = _load_config()
    for s in config.get("servers", []):
        if s.get("id") == args.server_id:
            s["enabled"] = False
            _save_config(config)
            print(f"Server '{args.server_id}' disabled.")
            return
    print(f"Error: Server '{args.server_id}' not found.")
    sys.exit(1)


def cmd_remove(args):
    config = _load_config()
    servers = config.get("servers", [])
    new_servers = [s for s in servers if s.get("id") != args.server_id]
    if len(new_servers) == len(servers):
        print(f"Error: Server '{args.server_id}' not found.")
        sys.exit(1)
    config["servers"] = new_servers
    _save_config(config)
    print(f"Server '{args.server_id}' removed from config.")
    print(f"Note: Data in data/{args.server_id}/ was NOT deleted. Remove manually if needed.")


def main():
    parser = argparse.ArgumentParser(description="ComfyUI Server Manager")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # list
    subparsers.add_parser("list", help="List all configured servers")

    # add
    add_parser = subparsers.add_parser("add", help="Add a new server")
    add_parser.add_argument("--id", required=True, help="Unique server identifier")
    add_parser.add_argument("--name", help="Human-readable server name")
    add_parser.add_argument("--url", required=True, help="ComfyUI server URL")
    add_parser.add_argument("--output-dir", help="Output directory for generated images")

    # enable
    enable_parser = subparsers.add_parser("enable", help="Enable a server")
    enable_parser.add_argument("server_id", help="Server ID to enable")

    # disable
    disable_parser = subparsers.add_parser("disable", help="Disable a server")
    disable_parser.add_argument("server_id", help="Server ID to disable")

    # remove
    remove_parser = subparsers.add_parser("remove", help="Remove a server from config")
    remove_parser.add_argument("server_id", help="Server ID to remove")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    commands = {
        "list": cmd_list,
        "add": cmd_add,
        "enable": cmd_enable,
        "disable": cmd_disable,
        "remove": cmd_remove,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
