import { parseWorkflowUpload } from "../lib/workflowMapper";
import type { WorkflowDetailDto } from "../types/api";
import type { EditorState, SchemaParam, SchemaParamMap } from "../types/editor";

export function hydrateSchemaParams(
  workflowData: Record<string, unknown>,
  savedSchemaParams: Record<string, unknown>,
) {
  const extractedParams = { ...(parseWorkflowUpload(JSON.stringify(workflowData)).schemaParams as SchemaParamMap) };
  const savedEntries = Object.entries(savedSchemaParams || {});
  const isUiStateShape = savedEntries.some(([, savedParam]) => savedParam && typeof savedParam === "object" && "exposed" in (savedParam as Record<string, unknown>));

  if (isUiStateShape) {
    savedEntries.forEach(([key, savedParam]) => {
      if (!extractedParams[key]) {
        return;
      }
      const saved = savedParam as Record<string, unknown>;
      extractedParams[key] = {
        ...extractedParams[key],
        exposed: Boolean(saved.exposed),
        name: String(saved.name || extractedParams[key].name),
        type: String(saved.type || extractedParams[key].type) as SchemaParam["type"],
        required: Boolean(saved.required),
        description: String(saved.description || ""),
        default: saved.default ?? extractedParams[key].default,
        example: saved.example ?? extractedParams[key].example,
        choices: Array.isArray(saved.choices) ? [...saved.choices] : [...(extractedParams[key].choices || [])],
      };
    });
    return extractedParams;
  }

  savedEntries.forEach(([name, savedParam]) => {
    const saved = savedParam as Record<string, unknown>;
    const key = `${saved.node_id}_${saved.field}`;
    if (!extractedParams[key]) {
      return;
    }
    extractedParams[key] = {
      ...extractedParams[key],
      exposed: true,
      name,
      type: String(saved.type || extractedParams[key].type) as SchemaParam["type"],
      required: Boolean(saved.required),
      description: String(saved.description || ""),
      default: saved.default ?? extractedParams[key].default,
      example: saved.example ?? extractedParams[key].example,
      choices: Array.isArray(saved.choices) ? [...saved.choices] : [...(extractedParams[key].choices || [])],
    };
  });

  return extractedParams;
}

export function buildEditorStateFromDetail(detail: WorkflowDetailDto): EditorState {
  return {
    workflowData: detail.workflow_data,
    schemaParams: hydrateSchemaParams(detail.workflow_data as Record<string, unknown>, detail.schema_params as Record<string, unknown>),
    workflowId: detail.workflow_id,
    description: detail.description || "",
    editingWorkflowId: detail.workflow_id,
    hasUnsavedChanges: false,
    upgradeSummary: null,
  };
}

export function applyRecommendedExposureSet(schemaParams: SchemaParamMap) {
  const commonFields = new Set(["prompt", "text", "negative_prompt", "seed", "steps", "cfg", "denoise", "width", "height", "batch_size", "filename_prefix"]);
  let changedCount = 0;
  const nextSchemaParams = { ...schemaParams };

  Object.entries(nextSchemaParams).forEach(([key, param]) => {
    if (!commonFields.has(param.field) || param.exposed) {
      return;
    }
    nextSchemaParams[key] = {
      ...param,
      exposed: true,
      name: param.name || param.field,
    };
    changedCount += 1;
  });

  return { nextSchemaParams, changedCount };
}
