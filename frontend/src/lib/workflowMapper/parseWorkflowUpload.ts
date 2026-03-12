import { extractSchemaParams } from "./schemaExtraction";
import type { SchemaParamMap } from "../../types/editor";

function isEditorWorkflow(workflowData: unknown) {
  return Boolean(
    workflowData
    && typeof workflowData === "object"
    && !Array.isArray(workflowData)
    && Array.isArray((workflowData as { nodes?: unknown[] }).nodes)
    && Array.isArray((workflowData as { links?: unknown[] }).links),
  );
}

export function parseWorkflowUpload(fileContent: string): {
  workflowData: Record<string, unknown>;
  schemaParams: SchemaParamMap;
} {
  const workflowData = JSON.parse(fileContent) as Record<string, unknown>;

  if (isEditorWorkflow(workflowData)) {
    const error = new Error("Unsupported ComfyUI editor workflow format") as Error & { code?: string };
    error.code = "EDITOR_WORKFLOW_FORMAT";
    throw error;
  }

  return {
    workflowData,
    schemaParams: extractSchemaParams(workflowData),
  };
}
