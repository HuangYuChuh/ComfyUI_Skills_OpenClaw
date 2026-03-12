import type {
  RunWorkflowResponseDto,
  SaveWorkflowPayload,
  TogglePayload,
  WorkflowDetailDto,
  WorkflowOrderPayload,
  WorkflowSummaryDto,
} from "../types/api";
import { requestJson } from "./http";

export function listWorkflows() {
  return requestJson<{ workflows: WorkflowSummaryDto[] }>("/api/workflows");
}

export function getWorkflowDetail(serverId: string, workflowId: string) {
  return requestJson<WorkflowDetailDto>(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`);
}

export function saveWorkflow(serverId: string, payload: SaveWorkflowPayload) {
  return requestJson<{ status: string; workflow_id: string }>(`/api/servers/${encodeURIComponent(serverId)}/workflow/save`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function toggleWorkflow(serverId: string, workflowId: string, payload: TogglePayload) {
  return requestJson<{ status: string; enabled: boolean }>(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}/toggle`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteWorkflow(serverId: string, workflowId: string) {
  return requestJson<{ status: string }>(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`, {
    method: "DELETE",
  });
}

export function reorderWorkflows(serverId: string, payload: WorkflowOrderPayload) {
  return requestJson<{ status: string; workflow_order: string[] }>(`/api/servers/${encodeURIComponent(serverId)}/workflows/reorder`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runWorkflow(serverId: string, workflowId: string, args: Record<string, unknown>) {
  return requestJson<RunWorkflowResponseDto>(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}/run`, {
    method: "POST",
    body: JSON.stringify({ args }),
  });
}
