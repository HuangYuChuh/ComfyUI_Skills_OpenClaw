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


DUPLICATE_NODES_WORKFLOW = {
    "23": {
        "inputs": {
            "prompt": "portrait style prompt",
            "seed": 42,
            "model": "Nano Banana 2 (Gemini 3.1 Flash Image)",
            "images": ["10", 0],
        },
        "class_type": "GeminiNanoBanana2",
        "_meta": {"title": "GeminiNanoBanana2"},
    },
    "26": {
        "inputs": {
            "prompt": "landscape style prompt",
            "seed": 99,
            "model": "Nano Banana 2 (Gemini 3.1 Flash Image)",
            "images": ["10", 0],
        },
        "class_type": "GeminiNanoBanana2",
        "_meta": {"title": "GeminiNanoBanana2"},
    },
    "9": {
        "inputs": {"filename_prefix": "ComfyUI", "images": ["23", 0]},
        "class_type": "SaveImage",
        "_meta": {"title": "Save Image 1"},
    },
    "24": {
        "inputs": {"filename_prefix": "ComfyUI", "images": ["26", 0]},
        "class_type": "SaveImage",
        "_meta": {"title": "Save Image 2"},
    },
    "10": {
        "inputs": {"image": "test.png"},
        "class_type": "LoadImage",
        "_meta": {"title": "Load Image"},
    },
}

DUPLICATE_NODES_WITH_TITLES = {
    "23": {
        "inputs": {"prompt": "portrait prompt", "seed": 42, "images": ["10", 0]},
        "class_type": "GeminiNanoBanana2",
        "_meta": {"title": "Portrait Style"},
    },
    "26": {
        "inputs": {"prompt": "landscape prompt", "seed": 99, "images": ["10", 0]},
        "class_type": "GeminiNanoBanana2",
        "_meta": {"title": "Landscape Style"},
    },
}


class TestDuplicateNodeParams(unittest.TestCase):
    """Duplicate same-type nodes must not lose parameters (#87)."""

    def test_all_params_extracted_from_duplicate_nodes(self):
        params = extract_schema_params(DUPLICATE_NODES_WORKFLOW)
        # Both nodes' prompt and seed should be present.
        self.assertIn("23_prompt", params)
        self.assertIn("26_prompt", params)
        self.assertIn("23_seed", params)
        self.assertIn("26_seed", params)

    def test_final_schema_preserves_all_duplicate_params(self):
        params = extract_schema_params(DUPLICATE_NODES_WORKFLOW)
        final = build_final_schema(params)
        # Both prompts and both seeds must appear in the final schema.
        prompt_entries = {k: v for k, v in final.items() if v["field"] == "prompt"}
        seed_entries = {k: v for k, v in final.items() if v["field"] == "seed"
                        and v["node_id"] in ("23", "26")}
        self.assertEqual(len(prompt_entries), 2,
                         f"Expected 2 prompt entries, got: {list(prompt_entries.keys())}")
        self.assertEqual(len(seed_entries), 2,
                         f"Expected 2 seed entries, got: {list(seed_entries.keys())}")
        # Verify they map to different nodes.
        prompt_node_ids = {v["node_id"] for v in prompt_entries.values()}
        self.assertEqual(prompt_node_ids, {"23", "26"})

    def test_sync_names_back_prevents_ui_params_collision(self):
        """The core bug fix: after build_final_schema with sync_names_back,
        ui_parameters should have unique names — no two exposed params
        with the same name."""
        params = extract_schema_params(DUPLICATE_NODES_WORKFLOW)
        build_final_schema(params, sync_names_back=True)
        exposed_names = [
            p["name"] for p in params.values() if p.get("exposed")
        ]
        self.assertEqual(len(exposed_names), len(set(exposed_names)),
                         f"Duplicate names found in ui_parameters: {exposed_names}")

    def test_node_titles_used_for_disambiguation(self):
        """When nodes have custom titles, use them instead of node IDs."""
        params = extract_schema_params(DUPLICATE_NODES_WITH_TITLES)
        final = build_final_schema(params)
        param_names = list(final.keys())
        # Should contain title-based names, not just node IDs.
        has_title_based = any("portrait" in n or "landscape" in n for n in param_names)
        self.assertTrue(has_title_based,
                        f"Expected title-based names, got: {param_names}")

    def test_single_node_type_keeps_simple_names(self):
        """When there's only one node of a type, names stay simple."""
        params = extract_schema_params(PLAIN_WORKFLOW)
        final = build_final_schema(params)
        self.assertIn("seed", final)
        self.assertIn("prompt", final)


if __name__ == "__main__":
    unittest.main()
