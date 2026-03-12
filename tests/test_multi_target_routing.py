from __future__ import annotations

import unittest
from unittest.mock import patch

import requests

from scripts import comfyui_client, registry


class DummyResponse:
    def __init__(self, *, ok: bool = True, status_code: int = 200):
        self.ok = ok
        self.status_code = status_code


class MultiTargetRoutingTests(unittest.TestCase):
    def test_registry_groups_same_workflow_id_into_multiple_targets(self) -> None:
        report = {
            "workflows": [
                {
                    "logical_workflow_id": "shared-workflow",
                    "workflow_id": "shared-workflow",
                    "deployment_workflow_id": "shared-workflow",
                    "server_id": "local",
                    "server_name": "Local",
                    "description": "Local variant",
                    "parameters": {"prompt": {"type": "string", "required": True, "description": "Prompt"}},
                    "origin": "local_upload",
                    "source_label": "Local Upload",
                    "tags": ["local"],
                    "_visible": True,
                    "_reasons": [],
                },
                {
                    "logical_workflow_id": "shared-workflow",
                    "workflow_id": "cloud-shared-workflow",
                    "deployment_workflow_id": "cloud-shared-workflow",
                    "server_id": "cloud",
                    "server_name": "Cloud",
                    "description": "Cloud variant",
                    "parameters": {"prompt": {"type": "string", "required": True, "description": "Prompt"}},
                    "origin": "bundled_cloud",
                    "source_label": "Bundled Cloud",
                    "tags": ["cloud"],
                    "_visible": True,
                    "_reasons": [],
                },
            ],
            "summary": {},
            "issues": [],
        }

        with patch("scripts.registry.get_runtime_config", return_value={"default_server": "local"}):
            catalog = registry.build_agent_workflow_catalog(report)

        self.assertEqual(1, len(catalog))
        entry = catalog[0]
        self.assertEqual("shared-workflow", entry["workflow_id"])
        self.assertEqual("local", entry["server_id"])
        self.assertEqual(2, entry["target_count"])
        self.assertEqual(["local", "cloud"], [target["server_id"] for target in entry["targets"]])
        self.assertEqual(["shared-workflow", "cloud-shared-workflow"], [target["workflow_id"] for target in entry["targets"]])

    def test_resolve_workflow_target_falls_back_to_healthy_non_default_target(self) -> None:
        report = {
            "workflows": [
                {
                    "logical_workflow_id": "shared-workflow",
                    "workflow_id": "shared-workflow",
                    "deployment_workflow_id": "shared-workflow",
                    "server_id": "local",
                    "_visible": True,
                    "_reasons": [],
                },
                {
                    "logical_workflow_id": "shared-workflow",
                    "workflow_id": "cloud-shared-workflow",
                    "deployment_workflow_id": "cloud-shared-workflow",
                    "server_id": "cloud",
                    "_visible": True,
                    "_reasons": [],
                },
            ],
        }
        servers = {
            "local": {"id": "local", "server_type": "comfyui", "url": "http://127.0.0.1:8188", "enabled": True},
            "cloud": {
                "id": "cloud",
                "server_type": "comfy_cloud",
                "url": "https://cloud.comfy.org",
                "enabled": True,
                "api_key": "cck_test",
            },
        }

        def fake_get(url: str, *args, **kwargs):
            if url.endswith("/queue"):
                raise requests.RequestException("local down")
            if url.endswith("/api/user"):
                return DummyResponse(ok=True, status_code=200)
            raise AssertionError(f"Unexpected URL {url}")

        with patch("scripts.comfyui_client.inspect_workflows", return_value=report), \
             patch("scripts.comfyui_client.get_server_by_id", side_effect=servers.get), \
             patch("scripts.comfyui_client.get_default_server_id", return_value="local"), \
             patch("scripts.comfyui_client.requests.get", side_effect=fake_get):
            server_id, resolved_workflow_id, resolution = comfyui_client.resolve_workflow_target(None, "shared-workflow")

        self.assertEqual("cloud", server_id)
        self.assertEqual("cloud-shared-workflow", resolved_workflow_id)
        self.assertEqual("default_server_unavailable_fallback_to_cloud", resolution["selection_reason"])

    def test_resolve_workflow_target_keeps_explicit_target(self) -> None:
        report = {
            "workflows": [
                {
                    "logical_workflow_id": "shared-workflow",
                    "workflow_id": "cloud-shared-workflow",
                    "deployment_workflow_id": "cloud-shared-workflow",
                    "server_id": "cloud",
                    "_visible": True,
                    "_reasons": [],
                },
            ],
        }
        with patch("scripts.comfyui_client.inspect_workflows", return_value=report):
            server_id, resolved_workflow_id, resolution = comfyui_client.resolve_workflow_target("cloud", "shared-workflow")
        self.assertEqual("cloud", server_id)
        self.assertEqual("cloud-shared-workflow", resolved_workflow_id)
        self.assertEqual("explicit_target", resolution["selection_reason"])


if __name__ == "__main__":
    unittest.main()
