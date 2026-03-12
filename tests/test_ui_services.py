from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.shared.cloud_templates import build_schema_metadata, get_installed_template_state
from ui.services import UIStorageService


class UIStorageServiceTests(unittest.TestCase):
    def test_serialize_server_for_ui_hides_cloud_api_key(self) -> None:
        payload = UIStorageService._serialize_server_for_ui({
            "id": "cloud",
            "name": "Cloud",
            "server_type": "comfy_cloud",
            "url": "https://cloud.comfy.org",
            "api_key": "cck_secret",
            "api_key_env": "COMFY_CLOUD_API_KEY",
        })

        self.assertTrue(payload["has_api_key"])
        self.assertNotIn("api_key", payload)
        self.assertEqual("COMFY_CLOUD_API_KEY", payload["api_key_env"])

    def test_save_workflow_refreshes_deployment_metadata_after_rename(self) -> None:
        service = UIStorageService()

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            config_path = root / "config.json"
            data_dir = root / "data"
            config_path.write_text(json.dumps({
                "servers": [
                    {
                        "id": "cloud",
                        "name": "Cloud",
                        "server_type": "comfy_cloud",
                        "url": "https://cloud.comfy.org",
                        "enabled": True,
                        "output_dir": "./outputs",
                        "api_key": "cck_secret",
                        "api_key_env": "",
                        "workflow_order": ["starter"],
                    }
                ],
                "default_server": "cloud",
            }), encoding="utf-8")

            def load_runtime_config() -> dict[str, object]:
                return json.loads(config_path.read_text(encoding="utf-8"))

            def workflow_path(server_id: str, workflow_id: str) -> Path:
                return data_dir / server_id / workflow_id / "workflow.json"

            def schema_path(server_id: str, workflow_id: str) -> Path:
                return data_dir / server_id / workflow_id / "schema.json"

            def list_workflow_dirs(server_id: str) -> list[Path]:
                server_dir = data_dir / server_id
                if not server_dir.exists():
                    return []
                return sorted(
                    [path for path in server_dir.iterdir() if path.is_dir() and not path.name.startswith(".")],
                    key=lambda path: path.name.lower(),
                )

            with patch("ui.services.CONFIG_PATH", config_path), \
                 patch("ui.services.get_runtime_config", side_effect=load_runtime_config), \
                 patch("scripts.shared.runtime_config.CONFIG_PATH", config_path), \
                 patch("ui.services.get_server_workflow_path", side_effect=workflow_path), \
                 patch("ui.services.get_server_schema_path", side_effect=schema_path), \
                 patch("ui.services.list_server_workflow_dirs", side_effect=list_workflow_dirs), \
                 patch("scripts.shared.cloud_templates.get_server_schema_path", side_effect=schema_path), \
                 patch("scripts.shared.cloud_templates.list_server_workflow_dirs", side_effect=list_workflow_dirs):
                service.save_workflow(
                    server_id="cloud",
                    workflow_id="starter",
                    original_workflow_id=None,
                    overwrite_existing=False,
                    description="Starter workflow",
                    workflow_data={"1": {"inputs": {}}},
                    schema_params={},
                    schema_metadata=build_schema_metadata(
                        origin="bundled_cloud",
                        template_id="cloud-starter",
                        source_label="Bundled Cloud",
                        logical_workflow_id="cloud-starter",
                        deployment_server_id="cloud",
                        deployment_workflow_id="starter",
                        tags=["starter"],
                    ),
                )

                service.save_workflow(
                    server_id="cloud",
                    workflow_id="starter-renamed",
                    original_workflow_id="starter",
                    overwrite_existing=False,
                    description="Starter workflow renamed",
                    workflow_data={"1": {"inputs": {"prompt": "hello"}}},
                    schema_params={},
                )

                renamed_schema = json.loads(
                    schema_path("cloud", "starter-renamed").read_text(encoding="utf-8")
                )
                self.assertEqual("starter-renamed", renamed_schema["deployment_workflow_id"])
                self.assertEqual("cloud", renamed_schema["deployment_server_id"])
                self.assertFalse((data_dir / "cloud" / "starter").exists())

                installed = get_installed_template_state("cloud")
                self.assertEqual("starter-renamed", installed[("bundled_cloud", "cloud-starter")])


if __name__ == "__main__":
    unittest.main()
