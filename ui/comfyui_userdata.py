from __future__ import annotations

import json
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

import requests

try:
    from .workflow_format import normalize_string
except ImportError:
    from workflow_format import normalize_string


class ComfyUIClientError(RuntimeError):
    pass


class ComfyUIServerAPI:
    def __init__(self, server_url: str, auth: str = ""):
        self.server_url = server_url.rstrip("/")
        self.session = requests.Session()
        if auth:
            self.session.headers["Authorization"] = auth

    def get_object_info(self) -> dict[str, Any]:
        response = self.session.get(f"{self.server_url}/object_info", timeout=20)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ComfyUIClientError("ComfyUI /object_info returned an unexpected payload.")
        return payload

    def list_workflow_paths(self) -> list[str]:
        candidates = [
            ("/v2/userdata", {"path": "workflows"}),
            ("/v2/userdata", {"dir": "workflows"}),
            ("/v2/userdata", {"directory": "workflows"}),
            ("/userdata", {"path": "workflows"}),
            ("/userdata", {"dir": "workflows"}),
            ("/userdata", {"directory": "workflows"}),
        ]

        last_error: Exception | None = None
        for route, params in candidates:
            try:
                response = self.session.get(f"{self.server_url}{route}", params=params, timeout=20)
                if response.status_code >= 400:
                    continue
                paths = self._extract_json_paths(response.json())
                return paths
            except (requests.RequestException, ValueError) as exc:
                last_error = exc

        if last_error is not None:
            raise ComfyUIClientError(f"Failed to list saved ComfyUI workflows: {last_error}") from last_error
        raise ComfyUIClientError("Failed to list saved ComfyUI workflows from /userdata.")

    def read_workflow_json(self, workflow_path: str) -> dict[str, Any]:
        encoded_path = quote(workflow_path.lstrip("/"), safe="")
        candidates = [
            (f"/userdata/{encoded_path}", None),
            (f"/v2/userdata/{encoded_path}", None),
            ("/userdata", {"path": workflow_path}),
            ("/v2/userdata", {"path": workflow_path}),
        ]

        last_error: Exception | None = None
        for route, params in candidates:
            try:
                response = self.session.get(f"{self.server_url}{route}", params=params, timeout=20)
                if response.status_code >= 400:
                    continue
                payload = response.json()
                if isinstance(payload, dict):
                    return payload
                if isinstance(payload, str):
                    parsed = json.loads(payload)
                    if isinstance(parsed, dict):
                        return parsed
            except (requests.RequestException, ValueError, json.JSONDecodeError) as exc:
                last_error = exc

        if last_error is not None:
            raise ComfyUIClientError(f"Failed to read workflow '{workflow_path}': {last_error}") from last_error
        raise ComfyUIClientError(f"Failed to read workflow '{workflow_path}'.")

    def _extract_json_paths(self, payload: Any) -> list[str]:
        found: set[str] = set()

        def visit(node: Any, parent_path: PurePosixPath = PurePosixPath("")) -> None:
            if isinstance(node, str):
                path = PurePosixPath(node)
                if path.suffix.lower() == ".json":
                    found.add(str(path))
                return

            if isinstance(node, dict):
                raw_name = normalize_string(node.get("name"))
                raw_path = normalize_string(node.get("path"))
                is_dir = node.get("is_dir")
                next_parent = parent_path

                if raw_path:
                    path = PurePosixPath(raw_path)
                    if path.suffix.lower() == ".json":
                        found.add(str(path))
                    next_parent = path
                elif raw_name:
                    path = parent_path / raw_name
                    if path.suffix.lower() == ".json" and is_dir is not True:
                        found.add(str(path))
                    if is_dir is True:
                        next_parent = path

                for key, value in node.items():
                    if key in {"name", "path"}:
                        continue
                    visit(value, next_parent)
                return

            if isinstance(node, list):
                for item in node:
                    visit(item, parent_path)

        visit(payload)
        return sorted(found)
