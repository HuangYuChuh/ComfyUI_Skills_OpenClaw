export type ServerType = "comfyui" | "comfy_cloud";

export interface ServerDto {
  id: string;
  name: string;
  server_type: ServerType;
  url: string;
  enabled: boolean;
  output_dir: string;
  api_key?: string;
  api_key_env?: string;
  use_api_key_for_partner_nodes?: boolean;
  has_api_key?: boolean;
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
  supports_direct_run?: boolean;
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
  supports_direct_run?: boolean;
}

export interface CloudTemplateSummaryDto {
  id: string;
  workflow_id?: string;
  name: string;
  description: string;
  tags: string[];
  origin: string;
  source_label: string;
  server_type_hint: ServerType;
  supports_direct_run: boolean;
  default_install: boolean;
  installed?: boolean;
  installed_workflow_id?: string;
}

export interface CloudTemplateImportResponseDto {
  status: string;
  imported: boolean;
  workflow_id: string;
  origin: string;
  source_label: string;
  tags: string[];
  supports_direct_run: boolean;
  suggested_test_args: Record<string, unknown>;
}

export interface RunWorkflowResponseDto {
  status: string;
  result: {
    status?: string;
    server?: string;
    server_type?: string;
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
  server_type: ServerType;
  url: string;
  enabled: boolean;
  output_dir: string;
  api_key: string;
  api_key_env: string;
  use_api_key_for_partner_nodes: boolean;
  keep_api_key?: boolean;
}

export interface WorkflowOrderPayload {
  workflow_ids: string[];
}
