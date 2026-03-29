"""Unit tests for dependency_checker module."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

import sys
from pathlib import Path

# Ensure ui package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from ui.dependency_checker import (
    DependencyCheckError,
    DependencyReport,
    ModelRef,
    MissingModel,
    MissingNode,
    extract_dependencies,
    check_dependencies,
)


class TestExtractDependencies(unittest.TestCase):
    """Tests for extract_dependencies()."""

    def test_extracts_class_types(self):
        workflow = {
            "1": {"class_type": "KSampler", "inputs": {"seed": 123}},
            "2": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}},
        }
        deps = extract_dependencies(workflow)
        self.assertEqual(deps.required_nodes, {"KSampler", "CheckpointLoaderSimple", "CLIPTextEncode"})

    def test_extracts_model_refs_from_known_loaders(self):
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "v1-5-pruned.safetensors"},
            },
            "2": {
                "class_type": "LoraLoader",
                "inputs": {"lora_name": "my_lora.safetensors", "model": ["1", 0]},
            },
            "3": {
                "class_type": "ControlNetLoader",
                "inputs": {"control_net_name": "control_v11p_sd15.pth"},
            },
        }
        deps = extract_dependencies(workflow)

        self.assertIn("checkpoints", deps.required_models)
        self.assertIn("loras", deps.required_models)
        self.assertIn("controlnet", deps.required_models)

        self.assertEqual(deps.required_models["checkpoints"][0].filename, "v1-5-pruned.safetensors")
        self.assertEqual(deps.required_models["loras"][0].filename, "my_lora.safetensors")
        self.assertEqual(deps.required_models["controlnet"][0].filename, "control_v11p_sd15.pth")

    def test_ignores_link_inputs_for_models(self):
        """Model fields that are links (list) should not be treated as filenames."""
        workflow = {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ["5", 0]}},
        }
        deps = extract_dependencies(workflow)
        self.assertEqual(deps.required_models, {})

    def test_rejects_non_api_format(self):
        editor_format = {"nodes": [], "links": []}
        with self.assertRaises(DependencyCheckError):
            extract_dependencies(editor_format)

    def test_rejects_empty_workflow(self):
        with self.assertRaises(DependencyCheckError):
            extract_dependencies({})

    def test_dual_clip_loader(self):
        workflow = {
            "1": {
                "class_type": "DualCLIPLoader",
                "inputs": {"clip_name1": "clip_a.safetensors", "clip_name2": "clip_b.safetensors"},
            },
        }
        deps = extract_dependencies(workflow)
        self.assertEqual(len(deps.required_models.get("clip", [])), 2)
        filenames = {ref.filename for ref in deps.required_models["clip"]}
        self.assertEqual(filenames, {"clip_a.safetensors", "clip_b.safetensors"})


class TestCheckDependencies(unittest.TestCase):
    """Tests for check_dependencies() with mocked HTTP calls."""

    @patch("ui.dependency_checker._check_missing_models")
    @patch("ui.dependency_checker._check_manager_model_support")
    @patch("ui.dependency_checker._fetch_installed_nodes")
    def test_all_nodes_installed(self, mock_fetch, mock_model_support, mock_models):
        mock_fetch.return_value = {"KSampler", "CheckpointLoaderSimple"}
        mock_model_support.return_value = False
        mock_models.return_value = []

        workflow = {
            "1": {"class_type": "KSampler", "inputs": {}},
            "2": {"class_type": "CheckpointLoaderSimple", "inputs": {}},
        }
        report = check_dependencies("http://localhost:8188", "", workflow)

        self.assertTrue(report.is_ready)
        self.assertEqual(len(report.missing_nodes), 0)

    @patch("ui.dependency_checker._check_missing_models")
    @patch("ui.dependency_checker._check_manager_model_support")
    @patch("ui.dependency_checker._fetch_manager_node_info")
    @patch("ui.dependency_checker._fetch_installed_nodes")
    @patch("ui.dependency_checker.NodeRegistry")
    def test_missing_nodes_detected(
        self, mock_registry_cls, mock_fetch, mock_manager_info,
        mock_model_support, mock_models,
    ):
        mock_fetch.return_value = {"KSampler"}
        mock_models.return_value = []
        mock_model_support.return_value = False

        # Manager has the mapping for SAMDetectorCombined
        mock_manager_info.return_value = {
            "mappings": {
                "SAMDetectorCombined": {
                    "url": "https://github.com/ltdrdata/ComfyUI-Impact-Pack"
                },
            },
            "import_fails": {},
            "available": True,
        }

        mock_registry = MagicMock()
        mock_registry.resolve_node_source.return_value = (
            "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
            "ComfyUI Impact Pack",
        )
        mock_registry_cls.return_value = mock_registry

        workflow = {
            "1": {"class_type": "KSampler", "inputs": {}},
            "2": {"class_type": "SAMDetectorCombined", "inputs": {}},
        }
        report = check_dependencies("http://localhost:8188", "", workflow)

        self.assertFalse(report.is_ready)
        self.assertEqual(len(report.missing_nodes), 1)
        self.assertEqual(report.missing_nodes[0].class_type, "SAMDetectorCombined")
        self.assertTrue(report.missing_nodes[0].can_auto_install)

    @patch("ui.dependency_checker._check_missing_models")
    @patch("ui.dependency_checker._check_manager_model_support")
    @patch("ui.dependency_checker._fetch_installed_nodes")
    def test_missing_models_detected(self, mock_fetch, mock_model_support, mock_models):
        mock_fetch.return_value = {"CheckpointLoaderSimple"}
        mock_model_support.return_value = False
        mock_models.return_value = [
            MissingModel(
                filename="v1-5-pruned.safetensors",
                folder="checkpoints",
                loader_node="CheckpointLoaderSimple",
                node_id="1",
            ),
        ]

        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "v1-5-pruned.safetensors"},
            },
        }
        report = check_dependencies("http://localhost:8188", "", workflow)

        self.assertFalse(report.is_ready)
        self.assertEqual(len(report.missing_models), 1)
        self.assertEqual(report.missing_models[0].filename, "v1-5-pruned.safetensors")

    @patch("ui.dependency_checker._check_missing_models")
    @patch("ui.dependency_checker._check_manager_model_support")
    @patch("ui.dependency_checker._fetch_manager_node_info")
    @patch("ui.dependency_checker._fetch_installed_nodes")
    @patch("ui.dependency_checker.NodeRegistry")
    def test_unknown_node_status(
        self, mock_registry_cls, mock_fetch, mock_manager_info,
        mock_model_support, mock_models,
    ):
        """Nodes not in Manager or Registry should be marked as 'unknown'."""
        mock_fetch.return_value = {"KSampler"}
        mock_models.return_value = []
        mock_model_support.return_value = False
        mock_manager_info.return_value = {
            "mappings": {},
            "import_fails": {},
            "available": True,
        }

        mock_registry = MagicMock()
        mock_registry.resolve_node_source.return_value = (None, None)
        mock_registry.search_cloud_registry.return_value = None
        mock_registry_cls.return_value = mock_registry

        workflow = {
            "1": {"class_type": "KSampler", "inputs": {}},
            "2": {"class_type": "MyPrivateNode", "inputs": {}},
        }
        report = check_dependencies("http://localhost:8188", "", workflow)

        self.assertFalse(report.is_ready)
        self.assertEqual(len(report.missing_nodes), 1)
        self.assertEqual(report.missing_nodes[0].status, "unknown")
        self.assertFalse(report.missing_nodes[0].can_auto_install)

    @patch("ui.dependency_checker._check_missing_models")
    @patch("ui.dependency_checker._check_manager_model_support")
    @patch("ui.dependency_checker._fetch_manager_node_info")
    @patch("ui.dependency_checker._fetch_installed_nodes")
    @patch("ui.dependency_checker.NodeRegistry")
    def test_import_fail_status(
        self, mock_registry_cls, mock_fetch, mock_manager_info,
        mock_model_support, mock_models,
    ):
        """Nodes with import failures should be marked accordingly."""
        mock_fetch.return_value = {"KSampler"}
        mock_models.return_value = []
        mock_model_support.return_value = False
        mock_manager_info.return_value = {
            "mappings": {
                "BrokenNode": {"url": "https://github.com/example/broken-pack"},
            },
            "import_fails": {
                "https://github.com/example/broken-pack": {
                    "title": "Broken Pack",
                    "reference": "https://github.com/example/broken-pack",
                },
            },
            "available": True,
        }

        mock_registry = MagicMock()
        mock_registry_cls.return_value = mock_registry

        workflow = {
            "1": {"class_type": "KSampler", "inputs": {}},
            "2": {"class_type": "BrokenNode", "inputs": {}},
        }
        report = check_dependencies("http://localhost:8188", "", workflow)

        self.assertFalse(report.is_ready)
        self.assertEqual(len(report.missing_nodes), 1)
        self.assertEqual(report.missing_nodes[0].status, "import_fail")
        self.assertTrue(report.missing_nodes[0].can_auto_install)


class TestReportFormatting(unittest.TestCase):
    """Tests for DependencyReport.format_text()."""

    def test_ready_report_zh(self):
        report = DependencyReport(is_ready=True)
        text = report.format_text("zh")
        self.assertIn("所有依赖已满足", text)

    def test_ready_report_en(self):
        report = DependencyReport(is_ready=True)
        text = report.format_text("en")
        self.assertIn("All dependencies satisfied", text)

    def test_missing_nodes_format(self):
        report = DependencyReport(
            is_ready=False,
            missing_nodes=[
                MissingNode(
                    class_type="SAM",
                    package_name="Impact Pack",
                    status="not_installed",
                    can_auto_install=True,
                ),
                MissingNode(
                    class_type="PrivateNode",
                    status="unknown",
                ),
            ],
        )
        text = report.format_text("zh")
        self.assertIn("[-]", text)
        self.assertIn("[?]", text)
        self.assertIn("Impact Pack", text)

    def test_missing_models_format(self):
        report = DependencyReport(
            is_ready=False,
            missing_models=[
                MissingModel(
                    filename="model.safetensors",
                    folder="checkpoints",
                    loader_node="CheckpointLoaderSimple",
                    node_id="1",
                    can_auto_download=True,
                ),
            ],
        )
        text = report.format_text("en")
        self.assertIn("[>]", text)
        self.assertIn("model.safetensors", text)


class TestDataclassSerialization(unittest.TestCase):
    """Tests for to_dict() on data classes."""

    def test_missing_node_to_dict(self):
        node = MissingNode(
            class_type="SAM",
            source_repo="https://github.com/example/repo",
            package_name="Example Pack",
            can_auto_install=True,
        )
        d = node.to_dict()
        self.assertEqual(d["class_type"], "SAM")
        self.assertTrue(d["can_auto_install"])
        self.assertIn("status", d)

    def test_missing_model_to_dict(self):
        model = MissingModel(
            filename="model.safetensors",
            folder="checkpoints",
            loader_node="CheckpointLoaderSimple",
            node_id="1",
        )
        d = model.to_dict()
        self.assertEqual(d["filename"], "model.safetensors")
        self.assertEqual(d["folder"], "checkpoints")
        self.assertIn("can_auto_download", d)

    def test_model_ref_to_dict(self):
        ref = ModelRef(
            filename="lora.safetensors",
            folder="loras",
            loader_node="LoraLoader",
            node_id="5",
        )
        d = ref.to_dict()
        self.assertEqual(d["filename"], "lora.safetensors")
        self.assertEqual(d["node_id"], "5")


if __name__ == "__main__":
    unittest.main()
