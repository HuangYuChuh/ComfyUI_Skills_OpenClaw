import { deleteWorkflow, getWorkflowDetail, reorderWorkflows, toggleWorkflow } from "../services/workflows";
import { reorderWorkflowCollection, restoreWorkflowOrder } from "../lib/workflowOrder";
import type { WorkflowDetailDto, WorkflowSummaryDto } from "../types/api";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { TranslateFn } from "./state";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
}

interface CreateWorkflowActionsArgs {
  workflows: WorkflowSummaryDto[];
  setWorkflows: Dispatch<SetStateAction<WorkflowSummaryDto[]>>;
  effectiveServerId: string | null;
  refreshWorkflows: () => Promise<void>;
  pushToast: (type: "success" | "error", message: string) => void;
  t: TranslateFn;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openEditor: (detail?: WorkflowDetailDto) => Promise<void>;
  ensureCanLeaveEditor: () => Promise<boolean>;
  pendingVersionTargetRef: MutableRefObject<WorkflowDetailDto | null>;
  versionUploadRef: RefObject<HTMLInputElement | null>;
}

export function createWorkflowActions(args: CreateWorkflowActionsArgs) {
  async function handleToggleWorkflow(workflow: WorkflowSummaryDto, enabled: boolean) {
    try {
      await toggleWorkflow(workflow.server_id, workflow.id, { enabled });
      await args.refreshWorkflows();
      args.pushToast("success", args.t(enabled ? "ok_toggle_wf_enabled" : "ok_toggle_wf_disabled", { id: workflow.id }));
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_toggle_wf"));
    }
  }

  async function handleDeleteWorkflow(workflow: WorkflowSummaryDto) {
    if (!(await args.confirm({
      title: args.t("confirm_action_title"),
      message: args.t("del_wf_confirm", { id: workflow.id }),
      confirmLabel: args.t("delete"),
      cancelLabel: args.t("cancel"),
      tone: "danger",
    }))) {
      return;
    }
    try {
      await deleteWorkflow(workflow.server_id, workflow.id);
      await args.refreshWorkflows();
      args.pushToast("success", args.t("ok_del_wf", { id: workflow.id }));
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_del_wf"));
    }
  }

  async function handleEditWorkflow(workflow: WorkflowSummaryDto) {
    try {
      await args.openEditor(await getWorkflowDetail(workflow.server_id, workflow.id));
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_load_saved_wf"));
    }
  }

  async function handleUploadWorkflowVersion(workflow: WorkflowSummaryDto) {
    if (!(await args.ensureCanLeaveEditor())) {
      return;
    }
    try {
      args.pendingVersionTargetRef.current = await getWorkflowDetail(workflow.server_id, workflow.id);
      args.versionUploadRef.current?.click();
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_load_saved_wf"));
    }
  }

  async function handleReorderWorkflows(sourceWorkflowId: string, targetWorkflowId: string, placeAfter: boolean) {
    if (!args.effectiveServerId || sourceWorkflowId === targetWorkflowId) {
      return;
    }
    const reordered = reorderWorkflowCollection(
      args.workflows,
      args.effectiveServerId,
      sourceWorkflowId,
      targetWorkflowId,
      placeAfter,
    );
    if (!reordered) {
      return;
    }
    args.setWorkflows(reordered.nextWorkflows);
    try {
      await reorderWorkflows(args.effectiveServerId, { workflow_ids: reordered.reorderedIds });
    } catch (error) {
      args.setWorkflows((current) => restoreWorkflowOrder(current, args.effectiveServerId as string, reordered.previousIds));
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_reorder_workflows"));
    }
  }

  return {
    handleToggleWorkflow,
    handleDeleteWorkflow,
    handleEditWorkflow,
    handleUploadWorkflowVersion,
    handleReorderWorkflows,
  };
}
