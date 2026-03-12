import { useState, useRef } from "react";
import { normalizeLanguage, translate, type Language } from "../i18n";
import { safeReadLocalStorage } from "../lib/storage";
import type { WorkflowDetailDto, WorkflowSummaryDto } from "../types/api";
import { buildEditorStateFromDetail } from "./editorUtils";
import { useAppEffects } from "./useAppEffects";
import { useAppDerivedState } from "./useAppDerivedState";
import { useConfirmState } from "./useConfirmState";
import { useServerManagement } from "./useServerManagement";
import { useToastState } from "./useToastState";
import { createEditorActions } from "./editorActions";
import {
  defaultEditorFilters,
  defaultEditorState,
  type ViewMode,
} from "./state";
import { createWorkflowActions } from "./workflowActions";
import { listWorkflows } from "../services/workflows";

export function useAppController() {
  const [language, setLanguage] = useState<Language>(() => normalizeLanguage(safeReadLocalStorage("ui-lang")));
  const [workflows, setWorkflows] = useState<WorkflowSummaryDto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [editorState, setEditorState] = useState(defaultEditorState());
  const [editorFilters, setEditorFilters] = useState(defaultEditorFilters());
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [expandedParamKeys, setExpandedParamKeys] = useState<Set<string>>(new Set());
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [workflowSort, setWorkflowSort] = useState("custom");
  const [lastAutoWorkflowId, setLastAutoWorkflowId] = useState("");

  const versionUploadRef = useRef<HTMLInputElement | null>(null);
  const pendingVersionTargetRef = useRef<WorkflowDetailDto | null>(null);
  const mappingSearchRef = useRef<HTMLInputElement | null>(null);
  const { toasts, dismissToast, pushToast } = useToastState();
  const { confirmState, setConfirmState, resolveConfirm, confirm } = useConfirmState();
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
  const serverManagement = useServerManagement({ t, pushToast, refreshWorkflows, setConfirmState });

  const derived = useAppDerivedState({
    currentServerId: serverManagement.currentServerId,
    defaultServerId: serverManagement.defaultServerId,
    servers: serverManagement.servers,
    workflows,
    workflowSearch,
    workflowSort,
    editorFilters,
    schemaParams: editorState.schemaParams,
    t,
  });

  function resetEditorUiState() {
    setCollapsedNodeIds(new Set());
    setExpandedParamKeys(new Set());
    setEditorFilters(defaultEditorFilters());
    setLastAutoWorkflowId("");
  }

  function resetEditor() {
    setEditorState(defaultEditorState());
    resetEditorUiState();
  }

  async function openEditor(detail?: WorkflowDetailDto) {
    resetEditorUiState();
    setEditorState(detail ? buildEditorStateFromDetail(detail) : defaultEditorState());
    setViewMode("editor");
  }

  async function refreshWorkflows() {
    const data = await listWorkflows();
    setWorkflows(data.workflows || []);
  }

  const editorActions = createEditorActions({
    editorState,
    setEditorState,
    expandedParamKeys,
    setExpandedParamKeys,
    groupedNodes: derived.groupedNodes,
    lastAutoWorkflowId,
    setLastAutoWorkflowId,
    currentServer: derived.currentServer,
    effectiveServerId: derived.effectiveServerId,
    confirm,
    refreshWorkflows,
    pushToast,
    setViewMode,
    resetEditor,
    resetEditorUiState,
    t,
    pendingVersionTargetRef,
  });

  const workflowActions = createWorkflowActions({
    workflows,
    setWorkflows,
    effectiveServerId: derived.effectiveServerId,
    refreshWorkflows,
    pushToast,
    t,
    confirm,
    openEditor,
    ensureCanLeaveEditor: editorActions.ensureCanLeaveEditor,
    pendingVersionTargetRef,
    versionUploadRef,
  });

  useAppEffects({
    language,
    toasts,
    dismissToast,
    loadInitialServers: serverManagement.loadInitialServers,
    refreshWorkflows,
    pushToast,
    t,
    viewMode,
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    confirmOpen: confirmState.open,
    serverModalOpen: serverManagement.serverModalOpen,
    editorQuery: editorFilters.query,
    clearEditorQuery: () => setEditorFilters((current) => ({ ...current, query: "" })),
    mappingSearchRef,
    saveWorkflow: editorActions.handleSaveWorkflow,
  });

  return {
    language,
    setLanguage: (value: string) => setLanguage(normalizeLanguage(value)),
    t,
    toasts,
    dismissToast,
    confirmState,
    setConfirmState,
    resolveConfirm,
    versionUploadRef,
    mappingSearchRef,
    viewMode,
    editorState,
    editorFilters,
    collapsedNodeIds,
    expandedParamKeys,
    workflowSearch,
    workflowSort,
    servers: serverManagement.servers,
    ...derived,
    serverModalOpen: serverManagement.serverModalOpen,
    serverModalMode: serverManagement.serverModalMode,
    serverForm: serverManagement.serverForm,
    setCurrentServerId: serverManagement.setCurrentServerId,
    setServerForm: serverManagement.setServerForm,
    setWorkflowSearch,
    setWorkflowSort,
    setEditorFilters,
    setCollapsedNodeIds,
    setExpandedParamKeys,
    setEditorState,
    setServerModalOpen: serverManagement.setServerModalOpen,
    handleAddServer: serverManagement.handleAddServer,
    handleEditServer: serverManagement.handleEditServer,
    handleSubmitServerModal: serverManagement.handleSubmitServerModal,
    handleToggleServer: serverManagement.handleToggleServer,
    requestDeleteServer: serverManagement.requestDeleteServer,
    handleBackFromEditor: editorActions.handleBackFromEditor,
    handleEditorUpload: editorActions.handleEditorUpload,
    handleSaveWorkflow: editorActions.handleSaveWorkflow,
    handleWorkflowIdChange: editorActions.handleWorkflowIdChange,
    updateEditorParam: editorActions.updateEditorParam,
    applyRecommendedExposures: editorActions.applyRecommendedExposures,
    exposeVisible: editorActions.exposeVisible,
    handleEditWorkflow: workflowActions.handleEditWorkflow,
    handleDeleteWorkflow: workflowActions.handleDeleteWorkflow,
    handleToggleWorkflow: workflowActions.handleToggleWorkflow,
    handleUploadWorkflowVersion: workflowActions.handleUploadWorkflowVersion,
    handleVersionFileChange: editorActions.handleVersionFileChange,
    handleReorderWorkflows: workflowActions.handleReorderWorkflows,
    createWorkflow: editorActions.createWorkflow,
  };
}
