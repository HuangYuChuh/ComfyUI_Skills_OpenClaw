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

export interface ValidationIssueDto {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface TransferSelectionServerPayload {
  server_id: string;
  workflow_ids: string[];
}

export interface TransferSelectionPayload {
  servers: TransferSelectionServerPayload[];
}

export interface TransferExportPreviewWorkflowDto {
  workflow_id: string;
  enabled: boolean;
  description: string;
  selected: boolean;
}

export interface TransferExportPreviewServerDto {
  server_id: string;
  name: string;
  enabled: boolean;
  selected: boolean;
  workflow_count: number;
  workflows: TransferExportPreviewWorkflowDto[];
}

export interface TransferExportPreviewDto {
  portable_only: boolean;
  summary: {
    servers: number;
    workflows: number;
    warnings: number;
  };
  servers: TransferExportPreviewServerDto[];
  warnings: ValidationIssueDto[];
}

export interface TransferExportBuildResponseDto {
  bundle: Record<string, unknown>;
  preview: TransferExportPreviewDto;
}

export interface TransferPlanItemDto {
  server_id: string;
  workflow_id?: string | null;
  reason: string;
}

export interface TransferPlanDto {
  created_servers: TransferPlanItemDto[];
  updated_servers: TransferPlanItemDto[];
  created_workflows: TransferPlanItemDto[];
  overwritten_workflows: TransferPlanItemDto[];
  skipped_items: TransferPlanItemDto[];
  warnings: ValidationIssueDto[];
  apply_environment: boolean;
  overwrite_workflows: boolean;
  summary: {
    created_servers: number;
    updated_servers: number;
    created_workflows: number;
    overwritten_workflows: number;
    skipped_items: number;
    warnings: number;
  };
}

export interface TransferValidationDto {
  valid: boolean;
  errors: ValidationIssueDto[];
  warnings: ValidationIssueDto[];
}

export interface TransferImportPreviewDto {
  validation: TransferValidationDto;
  plan: TransferPlanDto | null;
}

export interface TransferImportResponseDto {
  status: string;
  validation: TransferValidationDto;
  plan: TransferPlanDto;
}
