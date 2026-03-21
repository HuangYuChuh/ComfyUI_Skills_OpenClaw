from __future__ import annotations

import unittest

from ui.workflow_format import EditorWorkflowConverter, build_final_schema, extract_schema_params


class WorkflowFormatTests(unittest.TestCase):
    def test_build_final_schema_keeps_duplicate_common_aliases_unique(self) -> None:
        workflow_data = {
            "1": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": 512,
                    "height": 512,
                    "batch_size": 1,
                },
            },
            "2": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": 1024,
                    "height": 1024,
                    "batch_size": 2,
                },
            },
            "3": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "first",
                },
            },
            "4": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "second",
                },
            },
        }

        final_schema = build_final_schema(extract_schema_params(workflow_data))

        self.assertEqual(final_schema["width"]["node_id"], 1)
        self.assertEqual(final_schema["width_2"]["node_id"], 2)
        self.assertEqual(final_schema["height"]["node_id"], 1)
        self.assertEqual(final_schema["height_2"]["node_id"], 2)
        self.assertEqual(final_schema["batch_size"]["node_id"], 1)
        self.assertEqual(final_schema["batch_size_2"]["node_id"], 2)
        self.assertEqual(final_schema["filename_prefix"]["node_id"], 3)
        self.assertEqual(final_schema["filename_prefix_4"]["node_id"], 4)

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


if __name__ == "__main__":
    unittest.main()
