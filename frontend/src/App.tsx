import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { CustomSelect } from "./components/ui/CustomSelect";
import { ToastViewport, type ToastMessage } from "./components/ui/ToastViewport";
import { CloudTemplatesModal } from "./features/cloud-templates/CloudTemplatesModal";
import { EditorView } from "./features/editor/EditorView";
import { ServerManager } from "./features/servers/ServerManager";
import { WorkflowManager } from "./features/workflows/WorkflowManager";
import { applyEditorParamUpdate, applyVisibleExposure } from "./lib/editorState";
import { normalizeLanguage, translate, type Language } from "./i18n";
import { initPixelBlastBackground } from "./lib/pixelBlastBackground";
import { safeReadLocalStorage, safeWriteLocalStorage } from "./lib/storage";
import { reorderWorkflowCollection, restoreWorkflowOrder } from "./lib/workflowOrder";
import {
  buildFinalSchema,
  groupSchemaParams,
  migrateSchemaParams,
  parseWorkflowUpload,
  suggestWorkflowId,
} from "./lib/workflowMapper";
import { importCloudTemplate, listBundledCloudTemplates, listOfficialCloudTemplates } from "./services/cloudTemplates";
import { ApiError } from "./services/http";
import { addServer, deleteServer, listServers, toggleServer, updateServer } from "./services/servers";
import { deleteWorkflow, getWorkflowDetail, listWorkflows, reorderWorkflows, runWorkflow, saveWorkflow, toggleWorkflow } from "./services/workflows";
import type { CloudTemplateSummaryDto, SaveServerPayload, ServerDto, WorkflowDetailDto, WorkflowSummaryDto } from "./types/api";
import type { EditorState, SchemaParam, SchemaParamMap } from "./types/editor";

type ViewMode = "main" | "editor";
type ServerModalMode = "add" | "edit";
type CloudTemplateSource = "bundled" | "official";

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onResolve?: (confirmed: boolean, checked: boolean) => void;
}

function defaultServerForm(): SaveServerPayload {
  return {
    id: "",
    name: "",
    server_type: "comfyui",
    url: "",
    enabled: true,
    output_dir: "./outputs",
    api_key: "",
    api_key_env: "",
    use_api_key_for_partner_nodes: false,
  };
}

function defaultEditorState(): EditorState {
  return {
    workflowData: null,
    schemaParams: {},
    workflowId: "",
    description: "",
    editingWorkflowId: null,
    hasUnsavedChanges: false,
    upgradeSummary: null,
  };
}

function createToast(type: ToastMessage["type"], message: string): ToastMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
  };
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => normalizeLanguage(safeReadLocalStorage("ui-lang")));
  const [servers, setServers] = useState<ServerDto[]>([]);
  const [defaultServerId, setDefaultServerId] = useState<string | null>(null);
  const [currentServerId, setCurrentServerId] = useState<string | null>(() => safeReadLocalStorage("ui-server"));
  const [workflows, setWorkflows] = useState<WorkflowSummaryDto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverModalMode, setServerModalMode] = useState<ServerModalMode>("add");
  const [serverForm, setServerForm] = useState<SaveServerPayload>(defaultServerForm());
  const [editorState, setEditorState] = useState<EditorState>(defaultEditorState());
  const [editorFilters, setEditorFilters] = useState({
    query: "",
    exposedOnly: false,
    requiredOnly: false,
    nodeSort: "node_id_asc",
    paramSort: "default",
  });
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [expandedParamKeys, setExpandedParamKeys] = useState<Set<string>>(new Set());
  const [cloudTemplatesOpen, setCloudTemplatesOpen] = useState(false);
  const [cloudTemplateSource, setCloudTemplateSource] = useState<CloudTemplateSource>("bundled");
  const [cloudTemplates, setCloudTemplates] = useState<CloudTemplateSummaryDto[]>([]);
  const [cloudTemplatesLoading, setCloudTemplatesLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [workflowSort, setWorkflowSort] = useState("custom");
  const [lastAutoWorkflowId, setLastAutoWorkflowId] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
    tone: "primary",
  });

  const versionUploadRef = useRef<HTMLInputElement | null>(null);
  const pendingVersionTargetRef = useRef<WorkflowDetailDto | null>(null);
  const mappingSearchRef = useRef<HTMLInputElement | null>(null);
  const saveWorkflowRef = useRef<() => Promise<void>>(async () => {});

  const t = (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);

  const currentServer = useMemo(() => {
    const resolvedId = currentServerId || defaultServerId || servers[0]?.id || null;
    return servers.find((server) => server.id === resolvedId) || null;
  }, [currentServerId, defaultServerId, servers]);

  const effectiveServerId = currentServer?.id || null;

  const currentServerWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.server_id === effectiveServerId),
    [effectiveServerId, workflows],
  );

  const visibleWorkflows = useMemo(() => {
    const items = [...currentServerWorkflows];
    switch (workflowSort) {
      case "updated_desc":
        items.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        break;
      case "name_asc":
        items.sort((a, b) => a.id.localeCompare(b.id));
        break;
      case "name_desc":
        items.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case "enabled_first":
        items.sort((a, b) => {
          if (a.enabled !== b.enabled) {
            return a.enabled ? -1 : 1;
          }
          return a.id.localeCompare(b.id);
        });
        break;
      default:
        break;
    }

    const query = workflowSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((workflow) => {
      const haystack = [
        workflow.id,
        workflow.description,
        workflow.server_name,
        workflow.server_id,
        workflow.source_label,
        ...(workflow.tags || []),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [currentServerWorkflows, workflowSearch, workflowSort]);

  const groupedNodes = useMemo(() => {
    const query = editorFilters.query.trim().toLowerCase();
    const grouped = groupSchemaParams(editorState.schemaParams) as Array<[number, { classType: string; params: Array<SchemaParam & { key: string }> }]>;

    const sortNodes = [...grouped].sort((first, second) => {
      if (editorFilters.nodeSort === "node_id_desc") {
        return Number(second[0]) - Number(first[0]);
      }
      if (editorFilters.nodeSort === "class_asc") {
        return String(first[1].classType).localeCompare(String(second[1].classType));
      }
      return Number(first[0]) - Number(second[0]);
    });

    return (sortNodes
      .map(([nodeId, nodeData]) => {
        const params = [...nodeData.params]
          .sort((first, second) => {
            switch (editorFilters.paramSort) {
              case "field_asc":
                return first.field.localeCompare(second.field);
              case "type_asc":
                return String(first.type).localeCompare(String(second.type));
              case "exposed_first":
                if (first.exposed !== second.exposed) {
                  return first.exposed ? -1 : 1;
                }
                return first.field.localeCompare(second.field);
              default:
                return 0;
            }
          })
          .filter((param) => {
            if (editorFilters.exposedOnly && !param.exposed) {
              return false;
            }
            if (editorFilters.requiredOnly && !param.required) {
              return false;
            }
            if (!query) {
              return true;
            }
            const haystack = [
              nodeData.classType,
              String(nodeId),
              param.field,
              param.name,
              param.description,
              String(param.currentVal ?? ""),
            ].join(" ").toLowerCase();
            return haystack.includes(query);
          });
        return [String(nodeId), { classType: nodeData.classType, params }] as [string, { classType: string; params: Array<SchemaParam & { key: string }> }];
      })
      .filter(([, nodeData]) => nodeData.params.length > 0)) as Array<[string, { classType: string; params: Array<SchemaParam & { key: string }> }]>;
  }, [editorFilters, editorState.schemaParams]);

  const mappingSummaryText = useMemo(() => {
    const totalParams = Object.values(editorState.schemaParams).length;
    const totalExposed = Object.values(editorState.schemaParams).filter((parameter) => parameter.exposed).length;
    const visibleParams = groupedNodes.reduce((sum, [, nodeData]) => sum + nodeData.params.length, 0);
    const visibleNodes = groupedNodes.length;
    if (!totalParams) {
      return "";
    }
    return t("mapping_summary", {
      visible_params: visibleParams,
      total_params: totalParams,
      exposed_params: totalExposed,
      visible_nodes: visibleNodes,
    });
  }, [editorState.schemaParams, groupedNodes, t]);

  const editorEmptyStateMessageKey = useMemo(
    () => (Object.keys(editorState.schemaParams).length === 0 ? "empty_nodes" : "empty_nodes_filtered"),
    [editorState.schemaParams],
  );

  function pushToast(type: ToastMessage["type"], message: string) {
    setToasts((current) => [...current.slice(-3), createToast(type, message)]);
  }

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  async function confirm(options: Omit<ConfirmState, "open" | "onResolve">) {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        open: true,
        onResolve: (confirmed) => resolve(confirmed),
      });
    });
  }

  function closeConfirm() {
    setConfirmState((current) => ({ ...current, open: false, onResolve: undefined }));
  }

  function resolveConfirm(confirmed: boolean) {
    const checked = confirmState.checkboxChecked ?? false;
    const onResolve = confirmState.onResolve;
    closeConfirm();
    onResolve?.(confirmed, checked);
  }

  async function loadInitialServers() {
    const data = await listServers();
    setServers(data.servers || []);
    setDefaultServerId(data.default_server || null);
    const nextServerId = currentServerId && data.servers.some((server) => server.id === currentServerId)
      ? currentServerId
      : (data.default_server || data.servers[0]?.id || null);
    setCurrentServerId(nextServerId);
    if (nextServerId) {
      safeWriteLocalStorage("ui-server", nextServerId);
    }
  }

  async function refreshWorkflows() {
    const data = await listWorkflows();
    setWorkflows(data.workflows || []);
  }

  useEffect(() => {
    safeWriteLocalStorage("ui-lang", language);
  }, [language]);

  useEffect(() => {
    const timerIds = toasts.map((toast) => window.setTimeout(() => dismissToast(toast.id), 3200));
    return () => {
      timerIds.forEach((id) => window.clearTimeout(id));
    };
  }, [toasts]);

  useEffect(() => {
    Promise.all([loadInitialServers(), refreshWorkflows()]).catch((error: unknown) => {
      pushToast("error", error instanceof Error ? error.message : t("err_load_cfg"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => initPixelBlastBackground({
    variant: "circle",
    pixelSize: 4,
    color: "#a0223b",
    patternScale: 2,
    patternDensity: 1,
    pixelSizeJitter: 0,
    enableRipples: true,
    rippleSpeed: 0.4,
    rippleThickness: 0.12,
    rippleIntensityScale: 1.5,
    speed: 0.5,
    edgeFade: 0.25,
    transparent: true,
  }) || undefined, []);

  useEffect(() => {
    if (viewMode === "editor") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [viewMode]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editorState.hasUnsavedChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editorState.hasUnsavedChanges]);

  useEffect(() => {
    function handleEditorShortcuts(event: KeyboardEvent) {
      if (viewMode !== "editor" || confirmState.open || serverModalOpen || cloudTemplatesOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isInputLike = Boolean(
        target
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable),
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveWorkflowRef.current();
        return;
      }

      if (!isInputLike && event.key === "/") {
        event.preventDefault();
        mappingSearchRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && document.activeElement === mappingSearchRef.current && editorFilters.query) {
        setEditorFilters((current) => ({ ...current, query: "" }));
      }
    }

    document.addEventListener("keydown", handleEditorShortcuts);
    return () => document.removeEventListener("keydown", handleEditorShortcuts);
  }, [cloudTemplatesOpen, confirmState.open, editorFilters.query, serverModalOpen, viewMode]);

  function resetEditorUiState() {
    setCollapsedNodeIds(new Set());
    setExpandedParamKeys(new Set());
    setEditorFilters({
      query: "",
      exposedOnly: false,
      requiredOnly: false,
      nodeSort: "node_id_asc",
      paramSort: "default",
    });
    setLastAutoWorkflowId("");
  }

  function resetEditor() {
    setEditorState(defaultEditorState());
    resetEditorUiState();
  }

  async function openEditor(detail?: WorkflowDetailDto) {
    resetEditorUiState();
    if (detail) {
      setEditorState({
        workflowData: detail.workflow_data,
        schemaParams: hydrateSchemaParams(detail.workflow_data as Record<string, unknown>, detail.schema_params as Record<string, unknown>),
        workflowId: detail.workflow_id,
        description: detail.description || "",
        editingWorkflowId: detail.workflow_id,
        hasUnsavedChanges: false,
        upgradeSummary: null,
      });
    } else {
      setEditorState(defaultEditorState());
    }
    setViewMode("editor");
  }

  function hydrateSchemaParams(workflowData: Record<string, unknown>, savedSchemaParams: Record<string, unknown>) {
    const extractedParams = { ...(parseWorkflowUpload(JSON.stringify(workflowData)).schemaParams as SchemaParamMap) };
    const savedEntries = Object.entries(savedSchemaParams || {});
    const isUiStateShape = savedEntries.some(([, savedParam]) => savedParam && typeof savedParam === "object" && "exposed" in (savedParam as Record<string, unknown>));

    if (isUiStateShape) {
      savedEntries.forEach(([key, savedParam]) => {
        if (!extractedParams[key]) {
          return;
        }
        const saved = savedParam as Record<string, unknown>;
        extractedParams[key] = {
          ...extractedParams[key],
          exposed: Boolean(saved.exposed),
          name: String(saved.name || extractedParams[key].name),
          type: String(saved.type || extractedParams[key].type) as SchemaParam["type"],
          required: Boolean(saved.required),
          description: String(saved.description || ""),
          default: saved.default ?? extractedParams[key].default,
          example: saved.example ?? extractedParams[key].example,
          choices: Array.isArray(saved.choices) ? [...saved.choices] : [...(extractedParams[key].choices || [])],
        };
      });
      return extractedParams;
    }

    savedEntries.forEach(([name, savedParam]) => {
      const saved = savedParam as Record<string, unknown>;
      const key = `${saved.node_id}_${saved.field}`;
      if (!extractedParams[key]) {
        return;
      }
      extractedParams[key] = {
        ...extractedParams[key],
        exposed: true,
        name,
        type: String(saved.type || extractedParams[key].type) as SchemaParam["type"],
        required: Boolean(saved.required),
        description: String(saved.description || ""),
        default: saved.default ?? extractedParams[key].default,
        example: saved.example ?? extractedParams[key].example,
        choices: Array.isArray(saved.choices) ? [...saved.choices] : [...(extractedParams[key].choices || [])],
      };
    });
    return extractedParams;
  }

  async function ensureCanLeaveEditor() {
    if (!editorState.hasUnsavedChanges) {
      return true;
    }
    const confirmed = await confirm({
      title: t("confirm_action_title"),
      message: t("confirm_unsaved_leave"),
      confirmLabel: t("leave_anyway"),
      cancelLabel: t("cancel"),
      tone: "primary",
    });
    return confirmed;
  }

  async function handleBackFromEditor() {
    if (!(await ensureCanLeaveEditor())) {
      return;
    }
    resetEditor();
    setViewMode("main");
  }

  async function handleAddServer() {
    setServerModalMode("add");
    setServerForm(defaultServerForm());
    setServerModalOpen(true);
  }

  function handleEditServer(server: ServerDto) {
    setServerModalMode("edit");
    setServerForm({
      id: server.id,
      name: server.name,
      server_type: server.server_type,
      url: server.url,
      enabled: server.enabled,
      output_dir: server.output_dir,
      api_key: server.api_key || "",
      api_key_env: server.api_key_env || "",
      use_api_key_for_partner_nodes: Boolean(server.use_api_key_for_partner_nodes),
      keep_api_key: true,
    } as SaveServerPayload);
    setServerModalOpen(true);
  }

  function getNormalizedServerPayload() {
    const fallbackName = serverForm.name.trim() || serverForm.id?.trim() || currentServer?.id || "";
    return {
      ...serverForm,
      id: serverForm.id?.trim() || "",
      name: fallbackName,
      url: serverForm.url.trim(),
      output_dir: serverForm.output_dir.trim() || "./outputs",
      api_key: serverForm.api_key.trim(),
      api_key_env: serverForm.api_key_env.trim(),
    };
  }

  function validateServerForm() {
    const normalizedPayload = getNormalizedServerPayload();
    if (!normalizedPayload.name) {
      return t("err_server_name_required");
    }
    if (!normalizedPayload.url) {
      return t(serverModalMode === "edit" ? "err_server_name_id_url_required" : "err_server_name_url_required");
    }
    if (normalizedPayload.server_type === "comfy_cloud" && !normalizedPayload.api_key && !normalizedPayload.api_key_env) {
      const canKeep = serverModalMode === "edit" && currentServer?.has_api_key;
      if (!canKeep) {
        return t("err_cloud_api_key_required");
      }
    }
    return "";
  }

  async function handleSubmitServerModal() {
    const errorMessage = validateServerForm();
    if (errorMessage) {
      pushToast("error", errorMessage);
      return;
    }
    const normalizedPayload = getNormalizedServerPayload();
    try {
      if (serverModalMode === "add") {
        const created = await addServer(normalizedPayload);
        await loadInitialServers();
        await refreshWorkflows();
        setCurrentServerId(created.server.id);
        safeWriteLocalStorage("ui-server", created.server.id);
        pushToast("success", t("ok_add_server"));
      } else if (currentServer) {
        await updateServer(currentServer.id, {
          ...normalizedPayload,
          keep_api_key: currentServer.server_type === "comfy_cloud" && !normalizedPayload.api_key && !normalizedPayload.api_key_env && Boolean(currentServer.has_api_key),
        });
        await loadInitialServers();
        await refreshWorkflows();
        pushToast("success", t("ok_save_cfg"));
      }
      setServerModalOpen(false);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_add_server"));
    }
  }

  async function handleToggleServer(server: ServerDto, enabled: boolean) {
    try {
      await toggleServer(server.id, { enabled });
      await loadInitialServers();
      await refreshWorkflows();
      pushToast("success", t(enabled ? "ok_toggle_server_enabled" : "ok_toggle_server_disabled", { id: server.name || server.id }));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_toggle_server"));
    }
  }

  function requestDeleteServer(server: ServerDto) {
    setConfirmState({
      open: true,
      title: t("confirm_action_title"),
      message: t("del_server_confirm", { id: server.id }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      tone: "danger",
      checkboxLabel: t("delete_server_data_checkbox"),
      checkboxChecked: false,
      onResolve: async (confirmed, checked) => {
        if (!confirmed) {
          return;
        }
        try {
          await deleteServer(server.id, checked);
          await loadInitialServers();
          await refreshWorkflows();
          pushToast("success", t(checked ? "ok_del_server_with_data" : "ok_del_server_keep_data"));
        } catch (error) {
          pushToast("error", error instanceof Error ? error.message : t("err_del_server"));
        }
      },
    });
  }

  async function handleToggleWorkflow(workflow: WorkflowSummaryDto, enabled: boolean) {
    try {
      await toggleWorkflow(workflow.server_id, workflow.id, { enabled });
      await refreshWorkflows();
      pushToast("success", t(enabled ? "ok_toggle_wf_enabled" : "ok_toggle_wf_disabled", { id: workflow.id }));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_toggle_wf"));
    }
  }

  async function handleDeleteWorkflow(workflow: WorkflowSummaryDto) {
    const confirmed = await confirm({
      title: t("confirm_action_title"),
      message: t("del_wf_confirm", { id: workflow.id }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteWorkflow(workflow.server_id, workflow.id);
      await refreshWorkflows();
      pushToast("success", t("ok_del_wf", { id: workflow.id }));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_del_wf"));
    }
  }

  async function handleEditWorkflow(workflow: WorkflowSummaryDto) {
    try {
      const detail = await getWorkflowDetail(workflow.server_id, workflow.id);
      await openEditor(detail);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_load_saved_wf"));
    }
  }

  async function handleUploadWorkflowVersion(workflow: WorkflowSummaryDto) {
    if (!(await ensureCanLeaveEditor())) {
      return;
    }
    try {
      pendingVersionTargetRef.current = await getWorkflowDetail(workflow.server_id, workflow.id);
      versionUploadRef.current?.click();
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_load_saved_wf"));
    }
  }

  async function handleVersionFileChange(file: File | null) {
    const target = pendingVersionTargetRef.current;
    pendingVersionTargetRef.current = null;
    if (!file || !target) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseWorkflowUpload(text);
      const previousSchemaParams = hydrateSchemaParams(target.workflow_data, target.schema_params as Record<string, unknown>);
      const migration = migrateSchemaParams(previousSchemaParams, parsed.schemaParams) as {
        schemaParams: SchemaParamMap;
        summary: EditorState["upgradeSummary"];
      };
      setEditorState({
        workflowData: parsed.workflowData,
        schemaParams: migration.schemaParams,
        workflowId: target.workflow_id,
        description: target.description || "",
        editingWorkflowId: target.workflow_id,
        hasUnsavedChanges: true,
        upgradeSummary: migration.summary,
      });
      resetEditorUiState();
      setViewMode("editor");
      pushToast("success", t("workflow_upgrade_summary", {
        retained: migration.summary?.retained || 0,
        review: migration.summary?.review || 0,
        added: migration.summary?.added || 0,
        removed: migration.summary?.removed || 0,
      }));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_invalid_json"));
    }
  }

  async function handleEditorUpload(file: File | null) {
    if (!file) {
      return;
    }
    if (!effectiveServerId) {
      pushToast("error", t("err_select_server_first"));
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseWorkflowUpload(text);
      let nextSchemaParams = parsed.schemaParams as SchemaParamMap;
      let upgradeSummary = editorState.upgradeSummary;
      const suggestedWorkflowId = suggestWorkflowId(parsed.workflowData, file.name);
      if (editorState.editingWorkflowId) {
        const migration = migrateSchemaParams(editorState.schemaParams, parsed.schemaParams) as {
          schemaParams: SchemaParamMap;
          summary: EditorState["upgradeSummary"];
        };
        nextSchemaParams = migration.schemaParams;
        upgradeSummary = migration.summary;
      } else {
        upgradeSummary = null;
      }

      setEditorState((current) => ({
        ...current,
        workflowData: parsed.workflowData,
        schemaParams: nextSchemaParams,
        workflowId: !current.workflowId || current.workflowId === lastAutoWorkflowId ? suggestedWorkflowId : current.workflowId,
        hasUnsavedChanges: true,
        upgradeSummary,
      }));
      setLastAutoWorkflowId(suggestedWorkflowId);
      pushToast("success", t("ok_wf_load"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("err_invalid_json");
      pushToast("error", message.includes("editor workflow") ? t("err_ui_workflow_format") : message);
    }
  }

  function handleWorkflowIdChange(value: string) {
    setEditorState((current) => ({ ...current, workflowId: value, hasUnsavedChanges: true }));
    if (value.trim() !== lastAutoWorkflowId) {
      setLastAutoWorkflowId("");
    }
  }

  function updateEditorParam(key: string, field: keyof SchemaParam | "name" | "description" | "required" | "type" | "exposed", value: unknown) {
    const { schemaParams: nextSchemaParams, expandedParamKeys: nextExpandedParamKeys } = applyEditorParamUpdate(
      editorState.schemaParams,
      expandedParamKeys,
      key,
      field,
      value,
    );

    setExpandedParamKeys(nextExpandedParamKeys);
    setEditorState((current) => ({
      ...current,
      hasUnsavedChanges: true,
      schemaParams: nextSchemaParams,
    }));
  }

  function applyRecommendedExposures() {
    const commonFields = new Set(["prompt", "text", "negative_prompt", "seed", "steps", "cfg", "denoise", "width", "height", "batch_size", "filename_prefix"]);
    let changedCount = 0;
    const next = { ...editorState.schemaParams };
    Object.entries(next).forEach(([key, param]) => {
      if (!commonFields.has(param.field) || param.exposed) {
        return;
      }
      next[key] = {
        ...param,
        exposed: true,
        name: param.name || param.field,
      };
      changedCount += 1;
    });
    if (!changedCount) {
      pushToast("info", t("mapping_no_recommended_changes"));
      return;
    }
    setEditorState((current) => ({ ...current, schemaParams: next, hasUnsavedChanges: true }));
    pushToast("success", t("mapping_apply_recommended_ok", { count: changedCount }));
  }

  function exposeVisible(visible: boolean) {
    const visibleKeys = groupedNodes.flatMap(([, nodeData]) => nodeData.params.map((param) => param.key));
    if (!visibleKeys.length) {
      pushToast("error", t("mapping_no_visible_params"));
      return;
    }
    const {
      schemaParams: nextSchemaParams,
      expandedParamKeys: nextExpandedParamKeys,
      changedCount,
    } = applyVisibleExposure(editorState.schemaParams, expandedParamKeys, visibleKeys, visible);
    if (!changedCount) {
      pushToast("info", t("mapping_no_batch_changes"));
      return;
    }
    setExpandedParamKeys(nextExpandedParamKeys);
    setEditorState((current) => ({ ...current, schemaParams: nextSchemaParams, hasUnsavedChanges: true }));
    pushToast("success", t(visible ? "mapping_expose_visible_ok" : "mapping_unexpose_visible_ok", { count: changedCount }));
  }

  async function handleReorderWorkflows(sourceWorkflowId: string, targetWorkflowId: string, placeAfter: boolean) {
    if (!effectiveServerId || sourceWorkflowId === targetWorkflowId) {
      return;
    }

    const reordered = reorderWorkflowCollection(
      workflows,
      effectiveServerId,
      sourceWorkflowId,
      targetWorkflowId,
      placeAfter,
    );
    if (!reordered) {
      return;
    }

    setWorkflows(reordered.nextWorkflows);
    try {
      await reorderWorkflows(effectiveServerId, { workflow_ids: reordered.reorderedIds });
    } catch (error) {
      setWorkflows((current) => restoreWorkflowOrder(current, effectiveServerId, reordered.previousIds));
      pushToast("error", error instanceof Error ? error.message : t("err_reorder_workflows"));
    }
  }

  async function handleSaveWorkflow() {
    if (!effectiveServerId) {
      pushToast("error", t("err_no_server_selected"));
      return;
    }
    if (!editorState.workflowId.trim()) {
      pushToast("error", t("err_no_id"));
      return;
    }
    const { finalSchema, exposedCount, missingAlias } = buildFinalSchema(editorState.schemaParams);
    if (missingAlias) {
      pushToast("error", t("err_no_alias", { node: missingAlias.node_id, val: missingAlias.field }));
      return;
    }
    if (exposedCount === 0) {
      const confirmed = await confirm({
        title: t("confirm_action_title"),
        message: t("warn_no_params"),
        confirmLabel: t("save_anyway"),
        cancelLabel: t("cancel"),
        tone: "primary",
      });
      if (!confirmed) {
        return;
      }
    }
    if (!editorState.workflowData && !editorState.editingWorkflowId) {
      pushToast("error", t("err_no_workflow_uploaded"));
      return;
    }
    try {
      await saveWorkflow(effectiveServerId, {
        workflow_id: editorState.workflowId,
        server_id: effectiveServerId,
        original_workflow_id: editorState.editingWorkflowId,
        description: editorState.description,
        workflow_data: editorState.workflowData,
        schema_params: finalSchema || {},
        ui_schema_params: editorState.schemaParams,
        overwrite_existing: false,
      });
      await refreshWorkflows();
      setEditorState((current) => ({
        ...current,
        editingWorkflowId: current.workflowId,
        hasUnsavedChanges: false,
      }));
      pushToast("success", t("ok_save_wf"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const confirmed = await confirm({
          title: t("confirm_action_title"),
          message: t("warn_overwrite_wf", { id: editorState.workflowId }),
          confirmLabel: t("overwrite"),
          cancelLabel: t("cancel"),
          tone: "danger",
        });
        if (!confirmed) {
          return;
        }
        try {
          await saveWorkflow(effectiveServerId, {
            workflow_id: editorState.workflowId,
            server_id: effectiveServerId,
            original_workflow_id: editorState.editingWorkflowId,
            description: editorState.description,
            workflow_data: editorState.workflowData,
            schema_params: finalSchema || {},
            ui_schema_params: editorState.schemaParams,
            overwrite_existing: true,
          });
          await refreshWorkflows();
          setEditorState((current) => ({ ...current, editingWorkflowId: current.workflowId, hasUnsavedChanges: false }));
          pushToast("success", t("ok_save_wf"));
        } catch (saveError) {
          pushToast("error", saveError instanceof Error ? saveError.message : t("err_save_wf"));
        }
        return;
      }
      pushToast("error", error instanceof Error ? error.message : t("err_save_wf"));
    }
  }

  useEffect(() => {
    saveWorkflowRef.current = handleSaveWorkflow;
  });

  async function loadCloudTemplateList(source: CloudTemplateSource) {
    if (!effectiveServerId) {
      return;
    }
    setCloudTemplatesLoading(true);
    try {
      const response = source === "bundled"
        ? await listBundledCloudTemplates(effectiveServerId)
        : await listOfficialCloudTemplates(effectiveServerId);
      setCloudTemplates(response.templates || []);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_load_cloud_templates"));
    } finally {
      setCloudTemplatesLoading(false);
    }
  }

  async function openCloudExamples() {
    if (!currentServer) {
      pushToast("error", t("err_select_server_first"));
      return;
    }
    if (currentServer.server_type !== "comfy_cloud") {
      pushToast("error", t("cloud_templates_require_cloud_server"));
      return;
    }
    setCloudTemplatesOpen(true);
    setCloudTemplateSource("bundled");
    await loadCloudTemplateList("bundled");
  }

  async function handleImportCloudTemplate(template: CloudTemplateSummaryDto) {
    if (!effectiveServerId) {
      return;
    }
    try {
      const payload = await importCloudTemplate({
        server_id: effectiveServerId,
        source: cloudTemplateSource,
        template_id: template.id,
      });
      await refreshWorkflows();
      await loadCloudTemplateList(cloudTemplateSource);
      pushToast("success", t("cloud_templates_import_success", { id: payload.workflow_id }));
      const runNow = await confirm({
        title: t("confirm_action_title"),
        message: t("cloud_templates_try_run_prompt", { id: payload.workflow_id }),
        confirmLabel: t("cloud_templates_try_run"),
        cancelLabel: t("cancel"),
        tone: "primary",
      });
      if (runNow) {
        const response = await runWorkflow(effectiveServerId, payload.workflow_id, payload.suggested_test_args || {});
        const count = response.result?.images?.length || 0;
        pushToast("success", t("cloud_templates_run_success", { count }));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const overwrite = await confirm({
          title: t("confirm_action_title"),
          message: t("warn_overwrite_wf", { id: template.id }),
          confirmLabel: t("overwrite"),
          cancelLabel: t("cancel"),
          tone: "danger",
        });
        if (!overwrite) {
          return;
        }
        try {
          const payload = await importCloudTemplate({
            server_id: effectiveServerId,
            source: cloudTemplateSource,
            template_id: template.id,
            overwrite_existing: true,
          });
          await refreshWorkflows();
          await loadCloudTemplateList(cloudTemplateSource);
          pushToast("success", t("cloud_templates_import_success", { id: payload.workflow_id }));
        } catch (overwriteError) {
          pushToast("error", overwriteError instanceof Error ? overwriteError.message : t("err_import_cloud_template"));
        }
        return;
      }
      pushToast("error", error instanceof Error ? error.message : t("err_import_cloud_template"));
    }
  }

  async function handleTryRunCloudWorkflow(workflowId: string) {
    if (!effectiveServerId) {
      return;
    }
    try {
      const detail = await getWorkflowDetail(effectiveServerId, workflowId);
      const argsPayload: Record<string, unknown> = {};
      Object.entries(detail.schema_params as Record<string, Record<string, unknown>>).forEach(([paramName, paramInfo]) => {
        if (paramInfo && typeof paramInfo === "object" && "default" in paramInfo) {
          argsPayload[paramName] = paramInfo.default;
        }
      });
      const response = await runWorkflow(effectiveServerId, workflowId, argsPayload);
      pushToast("success", t("cloud_templates_run_success", { count: response.result?.images?.length || 0 }));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : t("err_run_cloud_template"));
    }
  }

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      {viewMode === "main" ? (
        <main className="page shell">
          <header className="page-header">
            <div className="logo-frame" aria-hidden="true">
              <img className="logo-image" src="/static/logo.png" alt="ComfyUI OpenClaw logo" />
            </div>
            <div className="page-title-group">
              <h1>{t("title")}</h1>
              <p className="subtitle">{t("subtitle")}</p>
            </div>
            <CustomSelect
              value={language}
              options={[
                { value: "en", label: "English" },
                { value: "zh", label: "简体中文" },
                { value: "zh_hant", label: "繁體中文" },
              ]}
              onChange={(value) => setLanguage(normalizeLanguage(value))}
              ariaLabel="Language selector"
              className="is-lang-select"
            />
          </header>

          <ServerManager
            servers={servers}
            currentServerId={effectiveServerId}
            onSelectServer={(serverId) => {
              setCurrentServerId(serverId);
              safeWriteLocalStorage("ui-server", serverId);
            }}
            onToggleServer={handleToggleServer}
            onDeleteServer={requestDeleteServer}
            onOpenCreate={handleAddServer}
            onOpenEdit={handleEditServer}
            modalOpen={serverModalOpen}
            modalMode={serverModalMode}
            form={serverForm as SaveServerPayload}
            canKeepApiKey={Boolean(serverModalMode === "edit" && currentServer?.has_api_key)}
            onFormChange={(next) => setServerForm(next)}
            onCloseModal={() => setServerModalOpen(false)}
            onSubmitModal={handleSubmitServerModal}
            t={(key) => t(key)}
          />

          <WorkflowManager
            workflows={visibleWorkflows}
            allWorkflowsForCurrentServer={currentServerWorkflows.length}
            search={workflowSearch}
            sort={workflowSort}
            showCloudExamples={currentServer?.server_type === "comfy_cloud"}
            onSearchChange={setWorkflowSearch}
            onSortChange={setWorkflowSort}
            onCreateWorkflow={() => {
              if (!effectiveServerId) {
                pushToast("error", t("err_select_server_before_register"));
                return;
              }
              resetEditor();
              setViewMode("editor");
            }}
            onOpenCloudExamples={openCloudExamples}
            onEditWorkflow={handleEditWorkflow}
            onDeleteWorkflow={handleDeleteWorkflow}
            onToggleWorkflow={handleToggleWorkflow}
            onUploadWorkflowVersion={handleUploadWorkflowVersion}
            onReorderWorkflows={handleReorderWorkflows}
            t={t}
          />
        </main>
      ) : (
        <EditorView
          workflowId={editorState.workflowId}
          description={editorState.description}
          schemaParams={editorState.schemaParams}
          hasWorkflow={Boolean(editorState.workflowData)}
          emptyStateMessageKey={editorEmptyStateMessageKey}
          mode={editorState.editingWorkflowId ? "edit" : "create"}
          editingWorkflowId={editorState.editingWorkflowId}
          upgradeSummary={editorState.upgradeSummary}
          filters={editorFilters}
          collapsedNodeIds={collapsedNodeIds}
          expandedParamKeys={expandedParamKeys}
          groupedNodes={groupedNodes}
          summaryText={mappingSummaryText}
          searchInputRef={mappingSearchRef}
          onBack={handleBackFromEditor}
          onWorkflowIdChange={handleWorkflowIdChange}
          onDescriptionChange={(value) => setEditorState((current) => ({ ...current, description: value, hasUnsavedChanges: true }))}
          onUploadFile={handleEditorUpload}
          onSave={handleSaveWorkflow}
          onFilterChange={(next) => setEditorFilters((current) => ({ ...current, ...next }))}
          onResetFilters={() => setEditorFilters({
            query: "",
            exposedOnly: false,
            requiredOnly: false,
            nodeSort: "node_id_asc",
            paramSort: "default",
          })}
          onToggleNode={(nodeId) => setCollapsedNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
            return next;
          })}
          onToggleParamConfig={(key) => setExpandedParamKeys((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}
          onUpdateParam={updateEditorParam}
          onApplyRecommended={applyRecommendedExposures}
          onExposeVisible={exposeVisible}
          onCollapseAll={(collapsed) => {
            if (collapsed) {
              setCollapsedNodeIds(new Set(groupedNodes.map(([nodeId]) => nodeId)));
            } else {
              setCollapsedNodeIds(new Set());
            }
          }}
          t={t}
        />
      )}

      <CloudTemplatesModal
        open={cloudTemplatesOpen}
        source={cloudTemplateSource}
        templates={cloudTemplates}
        loading={cloudTemplatesLoading}
        summary={cloudTemplatesLoading ? t("loading") : t("cloud_templates_count", { count: cloudTemplates.length })}
        onClose={() => setCloudTemplatesOpen(false)}
        onChangeSource={async (source) => {
          setCloudTemplateSource(source);
          await loadCloudTemplateList(source);
        }}
        onImport={handleImportCloudTemplate}
        onTryRun={handleTryRunCloudWorkflow}
        t={t}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        tone={confirmState.tone}
        checkboxLabel={confirmState.checkboxLabel}
        checkboxChecked={confirmState.checkboxChecked}
        onCheckboxChange={(checked) => setConfirmState((current) => ({ ...current, checkboxChecked: checked }))}
        onCancel={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
      />

      <input
        ref={versionUploadRef}
        type="file"
        accept=".json"
        className="sr-only"
        onChange={(event) => {
          handleVersionFileChange(event.target.files?.[0] || null);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
