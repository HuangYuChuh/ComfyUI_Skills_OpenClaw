import { applyEditorParamUpdate, applyVisibleExposure } from "../lib/editorState";
import { buildFinalSchema, migrateSchemaParams, parseWorkflowUpload, suggestWorkflowId } from "../lib/workflowMapper";
import type { EditorState, SchemaParam, SchemaParamMap } from "../types/editor";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { WorkflowDetailDto } from "../types/api";
import { applyRecommendedExposureSet } from "./editorUtils";
import { persistWorkflow } from "./workflowPersistence";
import type { TranslateFn, ViewMode } from "./state";
import type { MappingNodeGroup } from "../features/editor/types";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
}

interface CreateEditorActionsArgs {
  editorState: EditorState;
  setEditorState: Dispatch<SetStateAction<EditorState>>;
  expandedParamKeys: Set<string>;
  setExpandedParamKeys: Dispatch<SetStateAction<Set<string>>>;
  groupedNodes: Array<[string, MappingNodeGroup]>;
  lastAutoWorkflowId: string;
  setLastAutoWorkflowId: Dispatch<SetStateAction<string>>;
  currentServer: { unsupported?: boolean; server_type?: string } | null;
  effectiveServerId: string | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  refreshWorkflows: () => Promise<void>;
  pushToast: (type: "success" | "error" | "info", message: string) => void;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  resetEditor: () => void;
  resetEditorUiState: () => void;
  t: TranslateFn;
  pendingVersionTargetRef: MutableRefObject<WorkflowDetailDto | null>;
}

export function createEditorActions(args: CreateEditorActionsArgs) {
  async function ensureCanLeaveEditor() {
    if (!args.editorState.hasUnsavedChanges) {
      return true;
    }
    return args.confirm({
      title: args.t("confirm_action_title"),
      message: args.t("confirm_unsaved_leave"),
      confirmLabel: args.t("leave_anyway"),
      cancelLabel: args.t("cancel"),
      tone: "primary",
    });
  }

  async function handleBackFromEditor() {
    if (!(await ensureCanLeaveEditor())) {
      return;
    }
    args.resetEditor();
    args.setViewMode("main");
  }

  async function handleVersionFileChange(file: File | null) {
    const target = args.pendingVersionTargetRef.current;
    args.pendingVersionTargetRef.current = null;
    if (!file || !target) {
      return;
    }
    try {
      const { buildVersionUpgradeState } = await import("./versionUpgrade");
      const nextEditorState = buildVersionUpgradeState(target, await file.text());
      args.setEditorState(nextEditorState);
      args.resetEditorUiState();
      args.setViewMode("editor");
      args.pushToast("success", args.t("workflow_upgrade_summary", {
        retained: nextEditorState.upgradeSummary?.retained || 0,
        review: nextEditorState.upgradeSummary?.review || 0,
        added: nextEditorState.upgradeSummary?.added || 0,
        removed: nextEditorState.upgradeSummary?.removed || 0,
      }));
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_invalid_json"));
    }
  }

  async function handleEditorUpload(file: File | null) {
    if (!file) {
      return;
    }
    if (!args.effectiveServerId) {
      args.pushToast("error", args.t("err_select_server_first"));
      return;
    }
    try {
      const parsed = parseWorkflowUpload(await file.text());
      const migration = args.editorState.editingWorkflowId
        ? migrateSchemaParams(args.editorState.schemaParams, parsed.schemaParams) as {
            schemaParams: SchemaParamMap;
            summary: typeof args.editorState.upgradeSummary;
          }
        : null;
      const suggestedWorkflowId = suggestWorkflowId(parsed.workflowData, file.name);
      args.setEditorState((current) => ({
        ...current,
        workflowData: parsed.workflowData,
        schemaParams: migration?.schemaParams || parsed.schemaParams as SchemaParamMap,
        workflowId: !current.workflowId || current.workflowId === args.lastAutoWorkflowId ? suggestedWorkflowId : current.workflowId,
        hasUnsavedChanges: true,
        upgradeSummary: migration?.summary || null,
      }));
      args.setLastAutoWorkflowId(suggestedWorkflowId);
      args.pushToast("success", args.t("ok_wf_load"));
    } catch (error) {
      const message = error instanceof Error ? error.message : args.t("err_invalid_json");
      args.pushToast("error", message.includes("editor workflow") ? args.t("err_ui_workflow_format") : message);
    }
  }

  function handleWorkflowIdChange(value: string) {
    args.setEditorState((current) => ({ ...current, workflowId: value, hasUnsavedChanges: true }));
    if (value.trim() !== args.lastAutoWorkflowId) {
      args.setLastAutoWorkflowId("");
    }
  }

  function updateEditorParam(
    key: string,
    field: keyof SchemaParam | "name" | "description" | "required" | "type" | "exposed",
    value: unknown,
  ) {
    const next = applyEditorParamUpdate(args.editorState.schemaParams, args.expandedParamKeys, key, field, value);
    args.setExpandedParamKeys(next.expandedParamKeys);
    args.setEditorState((current) => ({ ...current, hasUnsavedChanges: true, schemaParams: next.schemaParams }));
  }

  function applyRecommendedExposures() {
    const next = applyRecommendedExposureSet(args.editorState.schemaParams);
    if (!next.changedCount) {
      args.pushToast("info", args.t("mapping_no_recommended_changes"));
      return;
    }
    args.setEditorState((current) => ({ ...current, schemaParams: next.nextSchemaParams, hasUnsavedChanges: true }));
    args.pushToast("success", args.t("mapping_apply_recommended_ok", { count: next.changedCount }));
  }

  function exposeVisible(visible: boolean) {
    const visibleKeys = args.groupedNodes.flatMap(([, nodeData]) => nodeData.params.map((param) => param.key));
    if (!visibleKeys.length) {
      args.pushToast("error", args.t("mapping_no_visible_params"));
      return;
    }
    const next = applyVisibleExposure(args.editorState.schemaParams, args.expandedParamKeys, visibleKeys, visible);
    if (!next.changedCount) {
      args.pushToast("info", args.t("mapping_no_batch_changes"));
      return;
    }
    args.setExpandedParamKeys(next.expandedParamKeys);
    args.setEditorState((current) => ({ ...current, schemaParams: next.schemaParams, hasUnsavedChanges: true }));
    args.pushToast("success", args.t(visible ? "mapping_expose_visible_ok" : "mapping_unexpose_visible_ok", { count: next.changedCount }));
  }

  async function handleSaveWorkflow() {
    if (!args.effectiveServerId) {
      args.pushToast("error", args.t("err_no_server_selected"));
      return;
    }
    if (!args.editorState.workflowId.trim()) {
      args.pushToast("error", args.t("err_no_id"));
      return;
    }
    const { finalSchema, exposedCount, missingAlias } = buildFinalSchema(args.editorState.schemaParams);
    if (missingAlias) {
      args.pushToast("error", args.t("err_no_alias", { node: missingAlias.node_id, val: missingAlias.field }));
      return;
    }
    if (exposedCount === 0 && !(await args.confirm({
      title: args.t("confirm_action_title"),
      message: args.t("warn_no_params"),
      confirmLabel: args.t("save_anyway"),
      cancelLabel: args.t("cancel"),
      tone: "primary",
    }))) {
      return;
    }
    if (!args.editorState.workflowData && !args.editorState.editingWorkflowId) {
      args.pushToast("error", args.t("err_no_workflow_uploaded"));
      return;
    }

    await persistWorkflow({
      effectiveServerId: args.effectiveServerId,
      editorState: args.editorState,
      finalSchema: finalSchema || {},
      confirm: args.confirm,
      refreshWorkflows: args.refreshWorkflows,
      setEditorState: args.setEditorState,
      pushToast: args.pushToast,
      t: args.t,
    });
  }

  function createWorkflow() {
    if (args.currentServer?.unsupported) {
      args.pushToast("info", args.t("server_unsupported_reason", { type: args.currentServer.server_type || "unknown" }));
      return;
    }
    if (!args.effectiveServerId) {
      args.pushToast("error", args.t("err_select_server_before_register"));
      return;
    }
    args.resetEditor();
    args.setViewMode("editor");
  }

  return {
    ensureCanLeaveEditor,
    handleBackFromEditor,
    handleVersionFileChange,
    handleEditorUpload,
    handleWorkflowIdChange,
    updateEditorParam,
    applyRecommendedExposures,
    exposeVisible,
    handleSaveWorkflow,
    createWorkflow,
  };
}
