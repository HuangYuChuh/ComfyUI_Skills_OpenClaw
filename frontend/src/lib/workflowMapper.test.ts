import { describe, expect, it } from "vitest";
import {
  buildFinalSchema,
  migrateSchemaParams,
  parseWorkflowUpload,
  suggestWorkflowId,
} from "./workflowMapper";
import type { SchemaParamMap } from "../types/editor";

describe("workflowMapper", () => {
  it("parses api workflows and auto-exposes prompt params", () => {
    const result = parseWorkflowUpload(JSON.stringify({
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "hello world" },
      },
    }));

    expect(result.workflowData["1"]).toBeDefined();
    expect(result.schemaParams["1_text"]).toMatchObject({
      exposed: true,
      required: true,
      name: "prompt_1",
      type: "string",
    });
  });

  it("rejects editor workflow json", () => {
    expect(() => parseWorkflowUpload(JSON.stringify({
      nodes: [],
      links: [],
    }))).toThrow(/editor workflow format/i);
  });

  it("suggests workflow ids from metadata or file names", () => {
    expect(suggestWorkflowId({ metadata: { title: "My Fancy Flow" } })).toBe("My-Fancy-Flow");
    expect(suggestWorkflowId({}, "starter.flow.json")).toBe("starter-flow");
  });

  it("migrates matching params and flags fallback matches for review", () => {
    const previous: SchemaParamMap = {
      "1_text": {
        exposed: true,
        node_id: 1,
        field: "text",
        name: "prompt",
        type: "string",
        required: true,
        description: "prompt",
        choices: [],
        currentVal: "old",
        nodeClass: "CLIPTextEncode",
      },
    };
    const next: SchemaParamMap = {
      "9_text": {
        exposed: false,
        node_id: 9,
        field: "text",
        name: "text",
        type: "string",
        required: false,
        description: "",
        choices: [],
        currentVal: "new",
        nodeClass: "CLIPTextEncode",
      },
    };

    const migration = migrateSchemaParams(previous, next);
    expect(migration.summary.review).toBe(1);
    expect(migration.schemaParams["9_text"]).toMatchObject({
      exposed: true,
      name: "prompt",
      migrationStatus: "review",
    });
  });

  it("builds final schema and reports missing aliases", () => {
    const valid = buildFinalSchema({
      "1_text": {
        exposed: true,
        node_id: 1,
        field: "text",
        name: "prompt",
        type: "string",
        required: true,
        description: "Prompt",
        choices: [],
        currentVal: "hello",
        nodeClass: "CLIPTextEncode",
      },
    });
    expect(valid.finalSchema).toEqual({
      prompt: {
        node_id: 1,
        field: "text",
        required: true,
        type: "string",
        description: "Prompt",
      },
    });

    const invalid = buildFinalSchema({
      "1_seed": {
        exposed: true,
        node_id: 1,
        field: "seed",
        name: "",
        type: "int",
        required: false,
        description: "",
        choices: [],
        currentVal: 1,
        nodeClass: "KSampler",
      },
    });
    expect(invalid.finalSchema).toBeNull();
    expect(invalid.missingAlias?.field).toBe("seed");
  });
});
