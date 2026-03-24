"""Tests for schema.json compatibility with ComfyUI subgraph workflows.

Subgraph nodes use colon-separated IDs like "14:10" instead of plain integers.
These tests verify the full pipeline: schema extraction, schema building, and
parameter injection all work correctly with such IDs.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ui"))

from workflow_format import extract_schema_params, build_final_schema


SUBGRAPH_WORKFLOW = {
    "11": {
        "inputs": {"image": "test.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
    "13": {
        "inputs": {"images": ["14:10", 0]},
        "class_type": "PreviewImage",
        "_meta": {"title": "Preview Image"},
    },
    "14:10": {
        "inputs": {
            "prompt": ["14:12", 0],
            "mode": "img2img",
            "model": "test-model",
            "batch_size": 4,
            "seed": 12345,
            "image1": ["11", 0],
        },
        "class_type": "ComflyNanoBanana2Edit",
        "_meta": {"title": "Subgraph Node"},
    },
    "14:12": {
        "inputs": {"value": "a white rabbit"},
        "class_type": "PrimitiveStringMultiline",
        "_meta": {"title": "String Multiline"},
    },
}

PLAIN_WORKFLOW = {
    "3": {
        "inputs": {"seed": 0, "steps": 20, "cfg": 7},
        "class_type": "KSampler",
        "_meta": {"title": "KSampler"},
    },
    "6": {
        "inputs": {"text": "hello", "clip": ["4", 1]},
        "class_type": "CLIPTextEncode",
        "_meta": {"title": "CLIP Text Encode"},
    },
}


class TestExtractSchemaParams(unittest.TestCase):
    """extract_schema_params should handle both plain and subgraph node IDs."""

    def test_subgraph_node_ids_preserved_as_strings(self):
        params = extract_schema_params(SUBGRAPH_WORKFLOW)
        subgraph_keys = [k for k in params if k.startswith("14:")]
        self.assertTrue(len(subgraph_keys) > 0, "Should find subgraph node params")
        for key in subgraph_keys:
            self.assertIsInstance(params[key]["node_id"], str)
            self.assertTrue(":" in params[key]["node_id"])

    def test_plain_node_ids_are_strings(self):
        params = extract_schema_params(PLAIN_WORKFLOW)
        for p in params.values():
            self.assertIsInstance(p["node_id"], str)

    def test_subgraph_skips_link_inputs(self):
        params = extract_schema_params(SUBGRAPH_WORKFLOW)
        # "prompt" and "image1" are links (list), should be skipped
        self.assertNotIn("14:10_prompt", params)
        self.assertNotIn("14:10_image1", params)

    def test_subgraph_extracts_scalar_inputs(self):
        params = extract_schema_params(SUBGRAPH_WORKFLOW)
        self.assertIn("14:10_mode", params)
        self.assertIn("14:10_seed", params)
        self.assertIn("14:10_batch_size", params)
        self.assertEqual(params["14:10_seed"]["node_id"], "14:10")
        self.assertEqual(params["14:10_seed"]["field"], "seed")


class TestBuildFinalSchema(unittest.TestCase):
    """build_final_schema should produce valid schema with subgraph node IDs."""

    def test_subgraph_schema_node_id_is_string(self):
        params = extract_schema_params(SUBGRAPH_WORKFLOW)
        # Mark seed as exposed for testing
        params["14:10_seed"]["exposed"] = True
        params["14:10_seed"]["name"] = "seed"
        final = build_final_schema(params)
        self.assertIn("seed", final)
        self.assertEqual(final["seed"]["node_id"], "14:10")

    def test_plain_schema_node_id_is_string(self):
        params = extract_schema_params(PLAIN_WORKFLOW)
        final = build_final_schema(params)
        for p in final.values():
            self.assertIsInstance(p["node_id"], str)


class TestParameterInjection(unittest.TestCase):
    """Simulate comfyui_client.py parameter injection with subgraph IDs."""

    def _inject(self, workflow_data, parameters, args):
        """Replicate the injection logic from comfyui_client.py:330-336."""
        import copy
        wf = copy.deepcopy(workflow_data)
        injected = []
        for key, value in args.items():
            if key not in parameters:
                continue
            node_id = str(parameters[key]["node_id"])
            field = parameters[key]["field"]
            if node_id in wf and isinstance(wf[node_id], dict) and "inputs" in wf[node_id]:
                wf[node_id]["inputs"][field] = value
                injected.append(key)
        return wf, injected

    def test_inject_subgraph_params(self):
        schema = {
            "seed": {"node_id": "14:10", "field": "seed"},
            "batch_size": {"node_id": "14:10", "field": "batch_size"},
        }
        wf, injected = self._inject(SUBGRAPH_WORKFLOW, schema, {"seed": 42, "batch_size": 1})
        self.assertEqual(injected, ["seed", "batch_size"])
        self.assertEqual(wf["14:10"]["inputs"]["seed"], 42)
        self.assertEqual(wf["14:10"]["inputs"]["batch_size"], 1)

    def test_inject_plain_params(self):
        schema = {"seed": {"node_id": "3", "field": "seed"}}
        wf, injected = self._inject(PLAIN_WORKFLOW, schema, {"seed": 99})
        self.assertEqual(wf["3"]["inputs"]["seed"], 99)

    def test_inject_missing_node_id_is_skipped(self):
        schema = {"seed": {"node_id": "999:1", "field": "seed"}}
        wf, injected = self._inject(SUBGRAPH_WORKFLOW, schema, {"seed": 42})
        self.assertEqual(injected, [])


if __name__ == "__main__":
    unittest.main()
