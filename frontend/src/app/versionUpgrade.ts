import { migrateSchemaParams, parseWorkflowUpload } from "../lib/workflowMapper";
import type { WorkflowDetailDto } from "../types/api";
import type { EditorState, SchemaParamMap } from "../types/editor";
import { hydrateSchemaParams } from "./editorUtils";

export function buildVersionUpgradeState(target: WorkflowDetailDto, fileContent: string): EditorState {
  const parsed = parseWorkflowUpload(fileContent);
  const previousSchemaParams = hydrateSchemaParams(target.workflow_data, target.schema_params as Record<string, unknown>);
  const migration = migrateSchemaParams(previousSchemaParams, parsed.schemaParams) as {
    schemaParams: SchemaParamMap;
    summary: EditorState["upgradeSummary"];
  };

  return {
    workflowData: parsed.workflowData,
    schemaParams: migration.schemaParams,
    workflowId: target.workflow_id,
    description: target.description || "",
    editingWorkflowId: target.workflow_id,
    hasUnsavedChanges: true,
    upgradeSummary: migration.summary,
  };
}
