from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from ui.comfyui_userdata import ComfyUIServerAPI

from ui.workflow_import import (
    EditorWorkflowConverter,
    WorkflowBulkImporter,
    build_final_schema,
    extract_schema_params,
    suggest_workflow_id,
)


class _ServiceStub:
    def get_config(self) -> dict:
        return {
            "servers": [
                {
                    "id": "secure",
                    "url": "http://127.0.0.1:8188",
                    "auth": "Bearer secret-token",
                },
            ],
        }


class WorkflowImportTests(unittest.TestCase):
    def test_editor_workflow_converter_maps_links_and_widgets(self) -> None:
        object_info = {
            "CheckpointLoaderSimple": {
                "required": {
                    "ckpt_name": [["model.safetensors"]],
                },
            },
            "CLIPTextEncode": {
                "required": {
                    "text": ["STRING"],
                    "clip": ["CLIP"],
                },
            },
            "KSampler": {
                "required": {
                    "seed": ["INT"],
                    "steps": ["INT"],
                    "cfg": ["FLOAT"],
                    "sampler_name": [["euler"]],
                    "scheduler": [["normal"]],
                    "denoise": ["FLOAT"],
                    "model": ["MODEL"],
                    "positive": ["CONDITIONING"],
                    "negative": ["CONDITIONING"],
                    "latent_image": ["LATENT"],
                },
            },
        }
        editor_workflow = {
            "nodes": [
                {
                    "id": 1,
                    "type": "CheckpointLoaderSimple",
                    "inputs": [],
                    "widgets_values": ["model.safetensors"],
                    "title": "Load Checkpoint",
                },
                {
                    "id": 2,
                    "type": "CLIPTextEncode",
                    "inputs": [{"name": "clip"}],
                    "widgets_values": ["a portrait"],
                    "title": "Positive Prompt",
                },
                {
                    "id": 3,
                    "type": "KSampler",
                    "inputs": [
                        {"name": "model"},
                        {"name": "positive"},
                        {"name": "negative"},
                        {"name": "latent_image"},
                    ],
                    "widgets_values": [1234, 20, 7.0, "euler", "normal", 1.0],
                    "title": "Sampler",
                },
            ],
            "links": [
                [1, 1, 1, 2, 0, "CLIP"],
                [2, 1, 0, 3, 0, "MODEL"],
                [3, 2, 0, 3, 1, "CONDITIONING"],
            ],
        }

        converted = EditorWorkflowConverter(object_info).convert(editor_workflow)

        self.assertEqual(converted["1"]["inputs"]["ckpt_name"], "model.safetensors")
        self.assertEqual(converted["2"]["inputs"]["text"], "a portrait")
        self.assertEqual(converted["2"]["inputs"]["clip"], ["1", 1])
        self.assertEqual(converted["3"]["inputs"]["seed"], 1234)
        self.assertEqual(converted["3"]["inputs"]["steps"], 20)
        self.assertEqual(converted["3"]["inputs"]["cfg"], 7.0)
        self.assertEqual(converted["3"]["inputs"]["sampler_name"], "euler")
        self.assertEqual(converted["3"]["inputs"]["scheduler"], "normal")
        self.assertEqual(converted["3"]["inputs"]["denoise"], 1.0)
        self.assertEqual(converted["3"]["inputs"]["model"], ["1", 0])
        self.assertEqual(converted["3"]["inputs"]["positive"], ["2", 0])

    def test_editor_workflow_converter_preserves_output_slot_through_reroute(self) -> None:
        object_info = {
            "CheckpointLoaderSimple": {
                "required": {
                    "ckpt_name": [["model.safetensors"]],
                },
            },
            "CLIPTextEncode": {
                "required": {
                    "text": ["STRING"],
                    "clip": ["CLIP"],
                },
            },
        }
        editor_workflow = {
            "nodes": [
                {
                    "id": 1,
                    "type": "CheckpointLoaderSimple",
                    "inputs": [],
                    "widgets_values": ["model.safetensors"],
                },
                {
                    "id": 4,
                    "type": "Reroute",
                    "inputs": [{"name": "", "link": 1}],
                },
                {
                    "id": 2,
                    "type": "CLIPTextEncode",
                    "inputs": [{"name": "clip"}],
                    "widgets_values": ["a portrait"],
                },
            ],
            "links": [
                [1, 1, 1, 4, 0, "CLIP"],
                [2, 4, 0, 2, 0, "CLIP"],
            ],
        }

        converted = EditorWorkflowConverter(object_info).convert(editor_workflow)

        self.assertEqual(converted["2"]["inputs"]["clip"], ["1", 1])

    def test_schema_extraction_and_final_schema_follow_recommended_rules(self) -> None:
        workflow_data = {
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "hello world",
                    "clip": ["1", 1],
                },
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 123,
                    "steps": 30,
                    "cfg": 7.5,
                },
            },
        }

        schema_params = extract_schema_params(workflow_data)
        final_schema = build_final_schema(schema_params)

        self.assertIn("prompt_2", final_schema)
        self.assertIn("seed", final_schema)
        self.assertIn("steps", final_schema)
        self.assertNotIn("cfg", final_schema)
        self.assertEqual(final_schema["prompt_2"]["field"], "text")
        self.assertEqual(final_schema["seed"]["type"], "int")
        self.assertEqual(final_schema["steps"]["default"], 30)

    def test_suggest_workflow_id_prefers_metadata_then_file_name(self) -> None:
        self.assertEqual(
            suggest_workflow_id({"metadata": {"title": "Portrait Studio"}}),
            "Portrait-Studio",
        )
        self.assertEqual(
            suggest_workflow_id({}, "character_render.json"),
            "character_render",
        )

    @patch("ui.workflow_import.ComfyUIServerAPI")
    def test_bulk_import_uses_server_auth_for_comfyui_requests(self, api_class) -> None:
        api = api_class.return_value
        api.list_workflow_paths.return_value = []

        importer = WorkflowBulkImporter(_ServiceStub(), "secure")
        importer.import_from_comfyui()

        api_class.assert_called_once_with("http://127.0.0.1:8188", "Bearer secret-token")

    def test_list_workflow_paths_returns_empty_list_for_empty_payload(self) -> None:
        api = ComfyUIServerAPI("http://127.0.0.1:8188")
        response = Mock()
        response.status_code = 200
        response.json.return_value = []
        api.session.get = Mock(return_value=response)

        self.assertEqual(api.list_workflow_paths(), [])


if __name__ == "__main__":
    unittest.main()
