import { describe, expect, it } from "vitest";
import { applyEditorParamUpdate, applyVisibleExposure } from "./editorState";
import type { SchemaParamMap } from "../types/editor";

const schemaParams: SchemaParamMap = {
  "1_text": {
    exposed: true,
    node_id: 1,
    field: "text",
    name: "prompt_1",
    type: "string",
    required: true,
    description: "Prompt",
    choices: [],
    currentVal: "hello",
    nodeClass: "CLIPTextEncode",
  },
  "2_seed": {
    exposed: true,
    node_id: 2,
    field: "seed",
    name: "seed",
    type: "int",
    required: false,
    description: "Seed",
    choices: [],
    currentVal: 1,
    nodeClass: "KSampler",
  },
};

describe("editorState helpers", () => {
  it("clears expanded state when an exposed param is toggled off", () => {
    const result = applyEditorParamUpdate(schemaParams, new Set(["1_text"]), "1_text", "exposed", false);
    expect(result.schemaParams["1_text"].exposed).toBe(false);
    expect(result.expandedParamKeys.has("1_text")).toBe(false);
  });

  it("clears expanded state for params hidden by bulk unexpose", () => {
    const result = applyVisibleExposure(schemaParams, new Set(["1_text", "2_seed"]), ["1_text"], false);
    expect(result.changedCount).toBe(1);
    expect(result.schemaParams["1_text"].exposed).toBe(false);
    expect(result.expandedParamKeys.has("1_text")).toBe(false);
    expect(result.expandedParamKeys.has("2_seed")).toBe(true);
  });
});
