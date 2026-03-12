import { ApiError } from "../services/http";
import { saveWorkflow } from "../services/workflows";
import type { EditorState } from "../types/editor";
import type { TranslateFn } from "./state";
import type { Dispatch, SetStateAction } from "react";

interface PersistWorkflowArgs {
  effectiveServerId: string;
  editorState: EditorState;
  finalSchema: Record<string, unknown>;
  confirm: (options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    tone: "primary" | "danger";
  }) => Promise<boolean>;
  refreshWorkflows: () => Promise<void>;
  setEditorState: Dispatch<SetStateAction<EditorState>>;
  pushToast: (type: "success" | "error", message: string) => void;
  t: TranslateFn;
}

export async function persistWorkflow(args: PersistWorkflowArgs) {
  const payload = {
    workflow_id: args.editorState.workflowId,
    server_id: args.effectiveServerId,
    original_workflow_id: args.editorState.editingWorkflowId,
    description: args.editorState.description,
    workflow_data: args.editorState.workflowData,
    schema_params: args.finalSchema || {},
    ui_schema_params: args.editorState.schemaParams,
  };

  try {
    await saveWorkflow(args.effectiveServerId, { ...payload, overwrite_existing: false });
    await args.refreshWorkflows();
    args.setEditorState((current) => ({ ...current, editingWorkflowId: current.workflowId, hasUnsavedChanges: false }));
    args.pushToast("success", args.t("ok_save_wf"));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_save_wf"));
      return;
    }

    const confirmed = await args.confirm({
      title: args.t("confirm_action_title"),
      message: args.t("warn_overwrite_wf", { id: args.editorState.workflowId }),
      confirmLabel: args.t("overwrite"),
      cancelLabel: args.t("cancel"),
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await saveWorkflow(args.effectiveServerId, { ...payload, overwrite_existing: true });
      await args.refreshWorkflows();
      args.setEditorState((current) => ({ ...current, editingWorkflowId: current.workflowId, hasUnsavedChanges: false }));
      args.pushToast("success", args.t("ok_save_wf"));
    } catch (saveError) {
      args.pushToast("error", saveError instanceof Error ? saveError.message : args.t("err_save_wf"));
    }
  }
}
