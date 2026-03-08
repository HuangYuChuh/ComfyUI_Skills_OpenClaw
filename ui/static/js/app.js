import { fetchJSON } from "./api.js";
import { getElements } from "./dom.js";
import { applyTranslations, t } from "./i18n.js";
import {
  getState,
  resetMappingState,
  setEditingWorkflowId,
  setLanguage,
  setSchemaParams,
  setUploadData,
  setWorkflows,
  toggleLanguage,
  updateSchemaParam,
  setServers,
  setDefaultServerId,
  setCurrentServerId,
  getCurrentServerId,
  getCurrentServer,
} from "./state.js";
import { showToast } from "./toast.js";
import {
  renderEditorMode,
  renderEmptyNodes,
  renderNodes,
  setEditorVisibility,
} from "./mapping-editor-view.js";
import {
  renderWorkflowList,
  renderWorkflowLoading,
  renderWorkflowSummary,
} from "./workflow-list-view.js";
import { buildFinalSchema, extractSchemaParams, parseWorkflowUpload } from "./workflow-mapper.js";
import { scrollToElement, setBusy, escapeHtml } from "./ui-utils.js";

let elements;

function $(...args) {
  return window.jQuery(...args);
}

// ── View Management ───────────────────────────────────────────────

function showView(viewName) {
  if (viewName === "main") {
    elements.viewMain.removeClass("hidden");
    elements.viewEditor.addClass("hidden");
  } else if (viewName === "editor") {
    elements.viewMain.addClass("hidden");
    elements.viewEditor.removeClass("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ── Rendering & UI Refresh ────────────────────────────────────────

function refreshServerSelector() {
  const { servers } = getState();
  const currentId = getCurrentServerId();

  elements.serverSelector.empty();
  if (servers.length === 0) {
    elements.serverSelector.append(`<option value="">${escapeHtml(t("no_servers"))}</option>`);
    elements.serverSelector.prop("disabled", true);
  } else {
    servers.forEach(s => {
      const selected = s.id === currentId ? "selected" : "";
      const statusIcon = s.enabled ? "🟢" : "⚫";
      elements.serverSelector.append(`<option value="${escapeHtml(s.id)}" ${selected}>${statusIcon} ${escapeHtml(s.name)}</option>`);
    });
    elements.serverSelector.prop("disabled", false);
  }

  // Update config fields based on current server
  const currentServer = getCurrentServer();
  if (currentServer) {
    elements.configUrl.val(currentServer.url || "");
    elements.configOutput.val(currentServer.output_dir || "");
    elements.serverEnabledToggle.prop("checked", currentServer.enabled);
    elements.serverEnabledLabel.attr("data-i18n", currentServer.enabled ? "server_enabled" : "server_disabled");
    elements.serverEnabledLabel.text(t(currentServer.enabled ? "server_enabled" : "server_disabled"));
    elements.currentServerActions.show();

    // reset edit panel
    closeServerEditPanel();
  } else {
    elements.configUrl.val("");
    elements.configOutput.val("");
    elements.currentServerActions.hide();
    elements.currentServerConfigPanel.addClass("hidden");
  }
}

// ── Edit Panel Interactivity ──────────────────────────────────────

function openServerEditPanel() {
  elements.currentServerConfigPanel.removeClass("hidden");
  elements.btnEditServer.addClass("hidden");
}

function closeServerEditPanel() {
  elements.currentServerConfigPanel.addClass("hidden");
  elements.btnEditServer.removeClass("hidden");
}

function refreshWorkflowPanel() {
  renderWorkflowSummary(elements.workflowSummary);
  renderWorkflowList(elements.workflowList);
}

function refreshEditorPanel() {
  renderEditorMode(elements.editorModeBadge, elements.saveWorkflowButton);
  renderNodes(elements.nodesContainer);
}

function clearEditorFields() {
  elements.workflowId.val("");
  elements.workflowDescription.val("");
  elements.fileUpload.val("");
}

function exitEditor() {
  resetMappingState();
  setEditingWorkflowId(null);
  clearEditorFields();
  setEditorVisibility(elements, false);
  refreshEditorPanel();
  showView("main");
}

function enterEditor({ workflowData, schemaParams, workflowId = "", description = "", editingWorkflowId = null }) {
  setUploadData(workflowData);
  setSchemaParams(schemaParams);
  setEditingWorkflowId(editingWorkflowId);
  elements.fileUpload.val("");
  elements.workflowId.val(workflowId);
  elements.workflowDescription.val(description);
  setEditorVisibility(elements, !!workflowData);
  refreshEditorPanel();
  showView("editor");
}

// ── Data Hydration ────────────────────────────────────────────────

function hydrateSchemaParams(workflowData, savedSchemaParams) {
  const extractedParams = extractSchemaParams(workflowData);

  Object.entries(savedSchemaParams || {}).forEach(([name, savedParam]) => {
    const key = `${savedParam.node_id}_${savedParam.field}`;
    if (!extractedParams[key]) {
      return;
    }

    extractedParams[key] = {
      ...extractedParams[key],
      exposed: true,
      name,
      type: savedParam.type || extractedParams[key].type,
      required: Boolean(savedParam.required),
      description: savedParam.description || "",
    };
  });

  return extractedParams;
}

// ── Server API Calls ──────────────────────────────────────────────

async function loadServers() {
  try {
    const data = await fetchJSON("/api/servers");
    setServers(data.servers || []);
    setDefaultServerId(data.default_server);
    // Ensure current server is valid
    const sid = getCurrentServerId();
    if (!data.servers.find(s => s.id === sid)) {
      setCurrentServerId(data.servers[0]?.id || null);
    }
    refreshServerSelector();
  } catch (error) {
    showToast(t("err_load_cfg"), "error");
    setServers([]);
    refreshServerSelector();
  }
}

async function saveCurrentServerConfig() {
  const currentServer = getCurrentServer();
  if (!currentServer) return;

  setBusy(elements.saveConfigButton, true);
  try {
    const url = elements.configUrl.val().trim();
    const output_dir = elements.configOutput.val().trim();

    await fetchJSON(`/api/servers/${encodeURIComponent(currentServer.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentServer, url, output_dir }),
    });

    await loadServers();
    showToast(t("ok_save_cfg"), "success");
    closeServerEditPanel();
  } catch (error) {
    showToast(error.message || t("err_save_cfg"), "error");
  } finally {
    setBusy(elements.saveConfigButton, false);
  }
}

async function addNewServer() {
  const btn = $("#add-server-btn");
  const idInput = $("#new-server-id");
  const urlInput = $("#new-server-url");

  const id = idInput.val().trim();
  const url = urlInput.val().trim();

  if (!id || !url) {
    showToast("Server ID and URL are required", "error");
    return;
  }

  setBusy(btn, true);
  try {
    await fetchJSON("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: id,
        url,
        enabled: true,
        output_dir: "./outputs"
      }),
    });

    idInput.val("");
    urlInput.val("");
    await loadServers();
    setCurrentServerId(id);
    refreshServerSelector();
    refreshWorkflowPanel();
    showToast(t("ok_add_server"), "success");
  } catch (error) {
    showToast(error.message || t("err_add_server"), "error");
  } finally {
    setBusy(btn, false);
  }
}

// ── Workflow API Calls ────────────────────────────────────────────

async function loadWorkflows() {
  renderWorkflowLoading(elements.workflowList);
  try {
    const data = await fetchJSON("/api/workflows");
    setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
    refreshWorkflowPanel();
  } catch {
    setWorkflows([]);
    renderWorkflowSummary(elements.workflowSummary);
    elements.workflowList.html(`<div class="empty-state">${t("err_load_workflows")}</div>`);
  }
}

async function loadWorkflowForEditing(serverId, workflowId, $button) {
  if ($button?.length) {
    $button.prop("disabled", true);
  }

  try {
    const data = await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`);
    enterEditor({
      workflowData: data.workflow_data,
      schemaParams: hydrateSchemaParams(data.workflow_data, data.schema_params),
      workflowId: data.workflow_id || workflowId,
      description: data.description || "",
      editingWorkflowId: data.workflow_id || workflowId,
    });
    showToast(t("ok_load_saved_wf"), "success");
  } catch (error) {
    showToast(error.message || t("err_load_saved_wf"), "error");
    showView("main");
  } finally {
    if ($button?.length) {
      $button.prop("disabled", false);
    }
  }
}

async function toggleWorkflowStatus(serverId, workflowId, $checkbox) {
  $checkbox.prop("disabled", true);
  try {
    const enabled = $checkbox.prop("checked");
    await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });

    const updatedWorkflows = getState().workflows.map((workflow) =>
      workflow.id === workflowId && workflow.server_id === serverId ? { ...workflow, enabled } : workflow,
    );
    setWorkflows(updatedWorkflows);
    refreshWorkflowPanel();
    showToast(t("ok_toggle_wf"), "success");
  } catch {
    $checkbox.prop("checked", !$checkbox.prop("checked"));
    showToast(t("err_toggle_wf"), "error");
  } finally {
    $checkbox.prop("disabled", false);
  }
}

async function deleteWorkflow(serverId, workflowId, $button) {
  if (!window.confirm(t("del_wf_confirm", { id: workflowId }))) {
    return;
  }

  $button.prop("disabled", true);
  try {
    await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`, { method: "DELETE" });
    if (getState().editingWorkflowId === workflowId) {
      exitEditor();
    }
    showToast(t("ok_del_wf", { id: workflowId }), "success");
    await loadWorkflows();
  } catch {
    showToast(t("err_del_wf"), "error");
    $button.prop("disabled", false);
  }
}

async function requestSaveWorkflow({
  serverId,
  workflowId,
  originalWorkflowId,
  description,
  workflowData,
  schemaParams,
}) {
  const savePayload = {
    workflow_id: workflowId,
    server_id: serverId,
    original_workflow_id: originalWorkflowId,
    description,
    workflow_data: workflowData,
    schema_params: schemaParams,
    overwrite_existing: false,
  };

  try {
    return await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(savePayload),
    });
  } catch (error) {
    if (error?.status !== 409) {
      throw error;
    }

    const confirmed = window.confirm(t("warn_overwrite_wf", { id: workflowId }));
    if (!confirmed) {
      error.cancelled = true;
      throw error;
    }

    return fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...savePayload,
        overwrite_existing: true,
      }),
    });
  }
}

async function saveWorkflow() {
  const serverId = getCurrentServerId();
  if (!serverId) {
    showToast("No server selected", "error");
    return;
  }

  const workflowId = elements.workflowId.val().trim();
  const description = elements.workflowDescription.val().trim();
  const { currentUploadData, schemaParams, editingWorkflowId } = getState();

  if (!workflowId) {
    showToast(t("err_no_id"), "error");
    return;
  }

  // Generate mapping schema from UI state
  const { finalSchema, exposedCount, missingAlias } = buildFinalSchema(schemaParams);
  if (missingAlias) {
    showToast(t("err_no_alias", { node: missingAlias.node_id, val: missingAlias.field }), "error");
    return;
  }

  if (exposedCount === 0 && !window.confirm(t("warn_no_params"))) {
    return;
  }

  // Prepare workflowData. If new upload, use currentUploadData.
  // If editing and no new upload, backend requires us to resend existing data,
  // but we skip the "need upload" check if editingWorkflowId is set.
  if (!currentUploadData && !editingWorkflowId) {
    showToast("No workflow data uploaded. Please upload a workflow JSON.", "error");
    return;
  }

  setBusy(elements.saveWorkflowButton, true);
  try {
    await requestSaveWorkflow({
      serverId,
      workflowId,
      originalWorkflowId: editingWorkflowId,
      description,
      // If editing but no new file uploaded, we might have partial data (the existing graph). 
      // The backend will fetch the existing one if we pass null for workflow_data.
      workflowData: currentUploadData || null,
      schemaParams: finalSchema,
    });
    showToast(t("ok_save_wf"), "success");
    await loadWorkflows();
    exitEditor();
  } catch (error) {
    if (error?.cancelled) {
      return;
    }
    showToast(error.message || t("err_save_wf"), "error");
  } finally {
    setBusy(elements.saveWorkflowButton, false);
  }
}

// ── File Upload ───────────────────────────────────────────────────

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function getUploadErrorMessage(error) {
  if (error?.code === "EDITOR_WORKFLOW_FORMAT") {
    return { message: t("err_ui_workflow_format"), duration: 5000 };
  }
  if (error?.code === "NO_MAPPABLE_PARAMS") {
    return { message: t("err_no_mappable_params"), duration: 4500 };
  }
  return { message: t("err_invalid_json"), duration: 3000 };
}

async function handleWorkflowFile(file) {
  if (!file) return;

  if (!getCurrentServerId()) {
    showToast("Please add/select a server first.", "error");
    return;
  }

  try {
    const fileContents = await readFile(file);
    const parsed = parseWorkflowUpload(fileContents);
    // Merge new parsed schemaParams with potentially existing ones (if user uploads a new json over an existing mapping)
    const { schemaParams: oldParams } = getState();
    const newSchema = { ...parsed.schemaParams };

    setUploadData(parsed.workflowData);
    setSchemaParams(newSchema);

    setEditorVisibility(elements, true);
    refreshEditorPanel();

    showToast(t("ok_wf_load"), "success");
  } catch (error) {
    const uploadError = getUploadErrorMessage(error);
    showToast(uploadError.message, "error", uploadError.duration);
  }
}

// ── Event Binding ─────────────────────────────────────────────────

function syncLanguage() {
  setLanguage(getState().currentLang);
  applyTranslations();
  refreshServerSelector();
  refreshWorkflowPanel();
  refreshEditorPanel();
}

function bindServerEvents() {
  elements.serverSelector.on("change", function () {
    const sid = $(this).val();
    setCurrentServerId(sid);
    refreshServerSelector(); // updates config inputs
    refreshWorkflowPanel(); // updates workflow list
  });

  $("#add-server-btn").on("click", addNewServer);

  elements.serverEnabledToggle.on("change", async function () {
    const enabled = $(this).prop("checked");
    const currentServer = getCurrentServer();
    if (!currentServer) return;

    $(this).prop("disabled", true);
    try {
      await fetchJSON(`/api/servers/${encodeURIComponent(currentServer.id)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await loadServers();
      showToast(t("ok_toggle_server"), "success");
    } catch (e) {
      $(this).prop("checked", !enabled);
      showToast(t("err_toggle_server"), "error");
    } finally {
      $(this).prop("disabled", false);
    }
  });

  elements.deleteServerBtn.on("click", async function () {
    const currentServer = getCurrentServer();
    if (!currentServer) return;

    if (!window.confirm(t("del_server_confirm", { id: currentServer.id }))) {
      return;
    }

    const $btn = $(this);
    $btn.prop("disabled", true);
    try {
      await fetchJSON(`/api/servers/${encodeURIComponent(currentServer.id)}`, { method: "DELETE" });
      await loadServers();
      refreshWorkflowPanel();
      showToast(t("ok_del_server"), "success");
    } catch (e) {
      showToast(t("err_del_server"), "error");
    } finally {
      $btn.prop("disabled", false);
    }
  });
}

function bindWorkflowEvents() {
  // Edit Server
  elements.btnEditServer.on("click", openServerEditPanel);
  elements.btnCancelEditServer.on("click", closeServerEditPanel);

  // New Workflow
  elements.addWorkflowBtn.on("click", () => {
    if (!getCurrentServerId()) {
      showToast("Please add/select a server to register a workflow.", "error");
      return;
    }
    enterEditor({ workflowData: null, schemaParams: {} });
  });

  elements.editorBackBtn.on("click", () => {
    exitEditor();
  });

  elements.workflowList.on("click", "button[data-action='delete-workflow']", function () {
    const $button = $(this);
    const $item = $button.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    deleteWorkflow(serverId, workflowId, $button);
  });

  elements.workflowList.on("click", "button[data-action='edit-workflow']", function () {
    const $button = $(this);
    const $item = $button.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    loadWorkflowForEditing(serverId, workflowId, $button);
  });

  elements.workflowList.on("change", "input[data-action='toggle-workflow']", function () {
    const $checkbox = $(this);
    const $item = $checkbox.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    toggleWorkflowStatus(serverId, workflowId, $checkbox);
  });
}

function bindNodeFieldUpdates() {
  elements.nodesContainer.on("input change", "[data-param-key][data-field]", function () {
    const $control = $(this);
    const paramKey = $control.data("paramKey");
    const field = $control.data("field");
    const value = $control.is(":checkbox") ? $control.prop("checked") : $control.val();
    updateSchemaParam(paramKey, field, value);

    if (field === "exposed") {
      renderNodes(elements.nodesContainer);
    }
  });
}

function bindUploadInteractions() {
  elements.fileUpload.on("change", async function () {
    await handleWorkflowFile(this.files?.[0]);
  });

  elements.uploadZone.on("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileUpload.trigger("click");
    }
  });

  elements.uploadZone.on("dragenter dragover", (event) => {
    event.preventDefault();
    elements.uploadZone.addClass("is-dragging");
  });

  elements.uploadZone.on("dragleave drop", (event) => {
    event.preventDefault();
    elements.uploadZone.removeClass("is-dragging");
  });

  elements.uploadZone.on("drop", async (event) => {
    const file = event.originalEvent?.dataTransfer?.files?.[0];
    await handleWorkflowFile(file);
  });
}

function bindEvents() {
  elements.langToggle.on("click", () => {
    toggleLanguage();
    applyTranslations();
    refreshServerSelector();
    refreshWorkflowPanel();
    refreshEditorPanel();
  });

  elements.saveConfigButton.on("click", saveCurrentServerConfig);
  elements.saveWorkflowButton.on("click", saveWorkflow);

  bindServerEvents();
  bindWorkflowEvents();
  bindNodeFieldUpdates();
  bindUploadInteractions();
}

function renderFatalJQueryError(error) {
  const message = error?.message || "Failed to initialize jQuery.";
  const root = document.body || document.documentElement;
  root.innerHTML = `<div style="padding:24px;color:#fff;background:#090b0f;font-family:system-ui,sans-serif;">${message}</div>`;
}

async function init() {
  if (!window.jQuery) {
    renderFatalJQueryError(new Error("Local jQuery failed to initialize."));
    return;
  }

  elements = getElements();
  syncLanguage();
  bindEvents();

  // Show Main View initially
  showView("main");
  renderEmptyNodes(elements.nodesContainer);

  // Load servers first, then workflows
  await loadServers();
  await loadWorkflows();
}

init();
