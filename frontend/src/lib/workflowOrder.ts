import type { WorkflowSummaryDto } from "../types/api";

export function reorderWorkflowCollection(
  workflows: WorkflowSummaryDto[],
  serverId: string,
  sourceWorkflowId: string,
  targetWorkflowId: string,
  placeAfter: boolean,
) {
  const serverWorkflows = workflows.filter((workflow) => workflow.server_id === serverId);
  const sourceIndex = serverWorkflows.findIndex((workflow) => workflow.id === sourceWorkflowId);
  const targetIndex = serverWorkflows.findIndex((workflow) => workflow.id === targetWorkflowId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return null;
  }

  const reorderedServerWorkflows = [...serverWorkflows];
  const [movedWorkflow] = reorderedServerWorkflows.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex = placeAfter ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  reorderedServerWorkflows.splice(insertIndex, 0, movedWorkflow);

  return {
    nextWorkflows: [
      ...workflows.filter((workflow) => workflow.server_id !== serverId),
      ...reorderedServerWorkflows,
    ],
    reorderedIds: reorderedServerWorkflows.map((workflow) => workflow.id),
    previousIds: serverWorkflows.map((workflow) => workflow.id),
  };
}

export function restoreWorkflowOrder(
  workflows: WorkflowSummaryDto[],
  serverId: string,
  orderedIds: string[],
) {
  const serverWorkflows = workflows.filter((workflow) => workflow.server_id === serverId);
  const byId = new Map(serverWorkflows.map((workflow) => [workflow.id, workflow]));
  const restoredServerWorkflows: WorkflowSummaryDto[] = [];

  orderedIds.forEach((workflowId) => {
    const workflow = byId.get(workflowId);
    if (workflow) {
      restoredServerWorkflows.push(workflow);
      byId.delete(workflowId);
    }
  });

  serverWorkflows.forEach((workflow) => {
    if (byId.has(workflow.id)) {
      restoredServerWorkflows.push(workflow);
      byId.delete(workflow.id);
    }
  });

  return [
    ...workflows.filter((workflow) => workflow.server_id !== serverId),
    ...restoredServerWorkflows,
  ];
}
