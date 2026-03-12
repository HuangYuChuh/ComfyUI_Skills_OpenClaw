export interface SchemaParam {
  exposed: boolean;
  node_id: number;
  field: string;
  name: string;
  type: "string" | "int" | "float" | "boolean";
  required: boolean;
  description: string;
  default?: unknown;
  example?: unknown;
  choices: unknown[];
  currentVal: unknown;
  nodeClass: string;
  migrationStatus?: string;
  migrationReason?: string;
}

export type SchemaParamMap = Record<string, SchemaParam>;

export interface UpgradeSummary {
  retained: number;
  review: number;
  added: number;
  removed: number;
  matched?: Array<{ previousKey: string; nextKey: string; status: string }>;
  addedKeys?: string[];
  removedKeys?: string[];
}

export interface EditorState {
  workflowData: Record<string, unknown> | null;
  schemaParams: SchemaParamMap;
  workflowId: string;
  description: string;
  editingWorkflowId: string | null;
  hasUnsavedChanges: boolean;
  upgradeSummary: UpgradeSummary | null;
}
