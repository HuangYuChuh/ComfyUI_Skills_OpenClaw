export interface ServerDto {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  output_dir: string;
  server_type?: string;
  unsupported?: boolean;
  unsupported_reason?: string;
}

export interface WorkflowSummaryDto {
  id: string;
  server_id: string;
  server_name: string;
  enabled: boolean;
  description: string;
  updated_at: number;
  origin?: string;
  source_label?: string;
  tags?: string[];
}

export interface WorkflowDetailDto {
  workflow_id: string;
  server_id: string;
  description: string;
  enabled: boolean;
  workflow_data: Record<string, unknown>;
  schema_params: Record<string, unknown>;
  origin?: string;
  source_label?: string;
  tags?: string[];
}

export interface RunWorkflowResponseDto {
  status: string;
  result: {
    status?: string;
    server?: string;
    prompt_id?: string;
    images?: string[];
    error?: string;
  };
}

export interface TogglePayload {
  enabled: boolean;
}

export interface SaveWorkflowPayload {
  workflow_id: string;
  server_id: string;
  original_workflow_id: string | null;
  description: string;
  workflow_data: Record<string, unknown> | null;
  schema_params: Record<string, unknown>;
  ui_schema_params: Record<string, unknown>;
  overwrite_existing: boolean;
}

export interface SaveServerPayload {
  id?: string | null;
  name: string;
  url: string;
  enabled: boolean;
  output_dir: string;
}

export interface WorkflowOrderPayload {
  workflow_ids: string[];
}
