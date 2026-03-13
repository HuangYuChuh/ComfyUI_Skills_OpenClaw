import { useState, useRef } from "react";
import { normalizeLanguage, translate, type Language } from "../i18n";
import { safeReadLocalStorage } from "../lib/storage";
import type {
  TransferExportPreviewDto,
  TransferImportPreviewDto,
  TransferPlanItemDto,
  TransferSelectionPayload,
  WorkflowDetailDto,
  WorkflowSummaryDto,
} from "../types/api";
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
import { buildTransferExport, importTransferBundle, previewTransferExport, previewTransferImport } from "../services/transfer";

interface TransferState {
  open: boolean;
  mode: "export" | "import" | null;
  exportPreview: TransferExportPreviewDto | null;
  exportSelection: TransferSelectionPayload;
  expandedServerIds: string[];
  importPreview: TransferImportPreviewDto | null;
  importBundle: Record<string, unknown> | null;
  applyEnvironment: boolean;
  loading: boolean;
}

function initialTransferState(): TransferState {
  return {
    open: false,
    mode: null,
    exportPreview: null,
    exportSelection: { servers: [] },
    expandedServerIds: [],
    importPreview: null,
    importBundle: null,
    applyEnvironment: false,
    loading: false,
  };
}

function createFullExportSelection(preview: TransferExportPreviewDto): TransferSelectionPayload {
  return {
    servers: preview.servers.map((server) => ({
      server_id: server.server_id,
      workflow_ids: server.workflows.map((workflow) => workflow.workflow_id),
    })),
  };
}

function getDefaultExpandedServerIds(preview: TransferExportPreviewDto): string[] {
  return preview.servers.length === 1 ? [preview.servers[0].server_id] : [];
}

function getTransferValidationMessages(detail: unknown): string[] {
  if (!detail || typeof detail !== "object") {
    return [];
  }

  const detailRecord = detail as Record<string, unknown>;
  const errors = Array.isArray(detailRecord.errors)
    ? detailRecord.errors
    : detailRecord.validation && typeof detailRecord.validation === "object" && Array.isArray((detailRecord.validation as Record<string, unknown>).errors)
      ? (detailRecord.validation as Record<string, unknown>).errors as unknown[]
      : [];

  return errors
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).message : ""))
    .filter((item): item is string => typeof item === "string" && Boolean(item));
}

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
  const [transferState, setTransferState] = useState<TransferState>(initialTransferState());

  const versionUploadRef = useRef<HTMLInputElement | null>(null);
  const transferImportRef = useRef<HTMLInputElement | null>(null);
  const pendingVersionTargetRef = useRef<WorkflowDetailDto | null>(null);
  const mappingSearchRef = useRef<HTMLInputElement | null>(null);
  const transferSessionRef = useRef(0);
  const importPreviewRequestRef = useRef(0);
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

  function createTransferSession() {
    transferSessionRef.current += 1;
    return transferSessionRef.current;
  }

  function isCurrentTransferSession(sessionId: number) {
    return transferSessionRef.current === sessionId;
  }

  function closeTransferModal() {
    createTransferSession();
    setTransferState(initialTransferState());
  }

  function getTransferErrorMessage(error: unknown, fallbackKey: string) {
    if (error && typeof error === "object" && "detail" in error) {
      const messages = getTransferValidationMessages((error as { detail?: unknown }).detail);
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return t(fallbackKey);
  }

  async function handleOpenTransferExport() {
    const sessionId = createTransferSession();
    try {
      const preview = await previewTransferExport();
      if (!isCurrentTransferSession(sessionId)) {
        return;
      }
      setTransferState({
        open: true,
        mode: "export",
        exportPreview: preview,
        exportSelection: createFullExportSelection(preview),
        expandedServerIds: getDefaultExpandedServerIds(preview),
        importPreview: null,
        importBundle: null,
        applyEnvironment: false,
        loading: false,
      });
    } catch (error) {
      pushToast("error", getTransferErrorMessage(error, "err_transfer_export_preview"));
    }
  }

  function handleOpenTransferImport() {
    transferImportRef.current?.click();
  }

  function toggleTransferServerSelection(serverId: string, workflowIds: string[]) {
    setTransferState((current) => {
      const existing = current.exportSelection.servers.find((server) => server.server_id === serverId);
      const nextSelected = existing && existing.workflow_ids.length === workflowIds.length ? [] : workflowIds;
      return {
        ...current,
        exportSelection: {
          servers: current.exportSelection.servers.map((server) => (
            server.server_id === serverId
              ? { ...server, workflow_ids: nextSelected }
              : server
          )),
        },
      };
    });
  }

  function toggleTransferWorkflowSelection(serverId: string, workflowId: string) {
    setTransferState((current) => ({
      ...current,
      exportSelection: {
        servers: current.exportSelection.servers.map((server) => {
          if (server.server_id !== serverId) {
            return server;
          }
          const workflowIds = server.workflow_ids.includes(workflowId)
            ? server.workflow_ids.filter((id) => id !== workflowId)
            : [...server.workflow_ids, workflowId];
          return { ...server, workflow_ids: workflowIds };
        }),
      },
    }));
  }

  function toggleTransferServerExpanded(serverId: string) {
    setTransferState((current) => ({
      ...current,
      expandedServerIds: current.expandedServerIds.includes(serverId)
        ? current.expandedServerIds.filter((id) => id !== serverId)
        : [...current.expandedServerIds, serverId],
    }));
  }

  async function handleConfirmTransfer() {
    if (transferState.mode === "export") {
      const sessionId = transferSessionRef.current;
      setTransferState((current) => ({ ...current, loading: true }));
      try {
        const response = await buildTransferExport(transferState.exportSelection);
        if (!isCurrentTransferSession(sessionId)) {
          return;
        }
        const payload = `${JSON.stringify(response.bundle, null, 2)}\n`;
        const blob = new Blob([payload], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "openclaw-skill-export.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        pushToast("success", t("ok_transfer_export_started"));
        closeTransferModal();
      } catch (error) {
        if (!isCurrentTransferSession(sessionId)) {
          return;
        }
        setTransferState((current) => ({ ...current, loading: false }));
        pushToast("error", getTransferErrorMessage(error, "err_transfer_export"));
      }
      return;
    }

    if (!transferState.importBundle) {
      return;
    }

    const sessionId = transferSessionRef.current;
    setTransferState((current) => ({ ...current, loading: true }));
    try {
      const report = await importTransferBundle(transferState.importBundle, transferState.applyEnvironment, true);
      if (!isCurrentTransferSession(sessionId)) {
        return;
      }
      await Promise.all([serverManagement.loadInitialServers(), refreshWorkflows()]);
      if (!isCurrentTransferSession(sessionId)) {
        return;
      }
      pushToast("success", t("ok_transfer_import", {
        servers: report.plan.summary.created_servers,
        created: report.plan.summary.created_workflows,
        overwritten: report.plan.summary.overwritten_workflows,
      }));
      closeTransferModal();
    } catch (error) {
      if (!isCurrentTransferSession(sessionId)) {
        return;
      }
      setTransferState((current) => ({ ...current, loading: false }));
      pushToast("error", getTransferErrorMessage(error, "err_transfer_import"));
    }
  }

  async function handleTransferImportFile(file: File | null) {
    if (!file) {
      return;
    }

    const requestId = importPreviewRequestRef.current + 1;
    importPreviewRequestRef.current = requestId;

    try {
      const text = await file.text();
      if (importPreviewRequestRef.current !== requestId) {
        return;
      }
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(t("err_transfer_invalid_bundle"));
      }

      const preview = await previewTransferImport(parsed, false, true);
      if (importPreviewRequestRef.current !== requestId) {
        return;
      }
      createTransferSession();
      setTransferState({
        open: true,
        mode: "import",
        exportPreview: null,
        exportSelection: { servers: [] },
        expandedServerIds: [],
        importPreview: preview,
        importBundle: parsed,
        applyEnvironment: false,
        loading: false,
      });
    } catch (error) {
      if (importPreviewRequestRef.current !== requestId) {
        return;
      }
      if (error instanceof SyntaxError || (error instanceof Error && error.message === t("err_transfer_invalid_bundle"))) {
        pushToast("error", t("err_transfer_invalid_bundle"));
        return;
      }
      pushToast("error", getTransferErrorMessage(error, "err_transfer_preview"));
    }
  }

  const importSections: Array<{ title: string; items: TransferPlanItemDto[] }> = [
    {
      title: t("transfer_section_created_servers"),
      items: transferState.importPreview?.plan?.created_servers || [],
    },
    {
      title: t("transfer_section_updated_servers"),
      items: transferState.importPreview?.plan?.updated_servers || [],
    },
    {
      title: t("transfer_section_created_workflows"),
      items: transferState.importPreview?.plan?.created_workflows || [],
    },
    {
      title: t("transfer_section_overwritten_workflows"),
      items: transferState.importPreview?.plan?.overwritten_workflows || [],
    },
    {
      title: t("transfer_section_skipped_items"),
      items: transferState.importPreview?.plan?.skipped_items || [],
    },
  ];

  const importPreviewSummary = t("transfer_preview_summary", {
    servers: transferState.importPreview?.plan?.summary.created_servers || 0,
    updated_servers: transferState.importPreview?.plan?.summary.updated_servers || 0,
    created: transferState.importPreview?.plan?.summary.created_workflows || 0,
    overwritten: transferState.importPreview?.plan?.summary.overwritten_workflows || 0,
    skipped: transferState.importPreview?.plan?.summary.skipped_items || 0,
    warnings: transferState.importPreview?.plan?.summary.warnings || 0,
  });

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
    transferModalOpen: transferState.open,
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
    transferImportRef,
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
    transferState,
    importSections,
    importPreviewSummary,
    handleAddServer: serverManagement.handleAddServer,
    handleEditServer: serverManagement.handleEditServer,
    handleSubmitServerModal: serverManagement.handleSubmitServerModal,
    handleToggleServer: serverManagement.handleToggleServer,
    requestDeleteServer: serverManagement.requestDeleteServer,
    handleOpenTransferExport,
    handleOpenTransferImport,
    handleTransferImportFile,
    handleConfirmTransfer,
    closeTransferModal,
    toggleTransferServerSelection,
    toggleTransferWorkflowSelection,
    toggleTransferServerExpanded,
    setTransferState,
    handleBackFromEditor: editorActions.handleBackFromEditor,
    handleEditorUpload: editorActions.handleEditorUpload,
    createWorkflowFromFile: editorActions.createWorkflowFromFile,
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
