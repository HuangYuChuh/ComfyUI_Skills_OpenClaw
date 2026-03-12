import type { SchemaParamMap, SchemaParam } from "../../types/editor";

type SchemaParamType = SchemaParam["type"];

function getTypeGuess(value: unknown): SchemaParamType {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "string";
}

function getAutoMapping(nodeClass: string, field: string, nodeId: string) {
  if (nodeClass.includes("KSampler")) {
    if (field === "seed") {
      return { exposed: true, required: false, name: field, description: "Random seed (for reproducibility)" };
    }
    if (field === "steps") {
      return { exposed: true, required: false, name: field, description: "Generation steps" };
    }
  }

  if (nodeClass.includes("CLIPTextEncode") || nodeClass.includes("Text") || nodeClass.includes("Prompt")) {
    if (field === "text" || field === "prompt") {
      return { exposed: true, required: true, name: `prompt_${nodeId}`, description: "Text prompt description" };
    }
  }

  if (nodeClass === "EmptyLatentImage" && ["width", "height", "batch_size"].includes(field)) {
    return { exposed: true, required: false, name: field, description: `Image ${field}` };
  }

  if (nodeClass === "SaveImage" && field === "filename_prefix") {
    return { exposed: true, required: false, name: field, description: "Output file prefix" };
  }

  if (nodeClass === "LightCCDoubaoImageNode") {
    if (field === "prompt") {
      return { exposed: true, required: true, name: field, description: "Positive image prompt" };
    }
    if (field === "size") {
      return { exposed: true, required: false, name: field, description: "e.g., 1:1,2048x2048" };
    }
    if (field === "seed") {
      return { exposed: true, required: false, name: field, description: "Random seed" };
    }
    if (field === "num") {
      return { exposed: true, required: false, name: field, description: "Number of images to generate" };
    }
  }

  return { exposed: false, required: false, name: field, description: "" };
}

export function extractSchemaParams(workflowData: Record<string, unknown>): SchemaParamMap {
  const schemaParams: SchemaParamMap = {};

  Object.entries(workflowData).forEach(([nodeId, nodeObject]) => {
    const nodeRecord = nodeObject as { inputs?: Record<string, unknown>; class_type?: string } | null;
    if (!nodeRecord?.inputs) {
      return;
    }

    const nodeClass = nodeRecord.class_type || "";
    Object.entries(nodeRecord.inputs).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        return;
      }

      const autoMapping = getAutoMapping(nodeClass, field, nodeId);
      schemaParams[`${nodeId}_${field}`] = {
        exposed: autoMapping.exposed,
        node_id: Number.parseInt(nodeId, 10),
        field,
        name: autoMapping.name,
        type: getTypeGuess(value),
        required: autoMapping.required,
        description: autoMapping.description,
        default: value,
        example: value,
        choices: [],
        currentVal: value,
        nodeClass: nodeClass || "UnknownNode",
      };
    });
  });

  return schemaParams;
}
