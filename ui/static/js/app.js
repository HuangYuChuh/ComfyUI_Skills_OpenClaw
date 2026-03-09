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
  updateSchemaParam,
  setServers,
  setDefaultServerId,
  setCurrentServerId,
  getCurrentServerId,
  getCurrentServer,
} from "./state.js";
import { showToast } from "./toast.js";
import { enhanceCustomSelects } from "./custom-select.js";
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
import { initPixelBlastBackground } from "./pixel-blast-bg.js";
import { buildFinalSchema, extractSchemaParams, parseWorkflowUpload, suggestWorkflowId } from "./workflow-mapper.js";
import { scrollToElement, setBusy, escapeHtml } from "./ui-utils.js";

let elements;
const editorFilters = {
  query: "",
  exposedOnly: false,
  requiredOnly: false,
  nodeSort: "node_id_asc",
  paramSort: "default",
};
const collapsedNodeIds = new Set();
const expandedParamKeys = new Set();
let latestEditorStats = null;
let hasEditorUnsavedChanges = false;
let serverModalMode = "add";
let confirmModalResolver = null;
let confirmModalPayloadBuilder = null;
let lastAutoWorkflowId = "";

function $(...args) {
  return window.jQuery(...args);
}

function markEditorDirty(isDirty = true) {
  hasEditorUnsavedChanges = isDirty;
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

  if (servers.length === 0) {
    elements.serverConfigContainer.addClass("hidden");
    elements.serverEmptyState.removeClass("hidden");
    elements.serverSelector.empty();
    elements.serverSelector.append(`<option value="">${escapeHtml(t("no_servers"))}</option>`);
    elements.serverSelector.prop("disabled", true);
    elements.currentServerActions.hide();
    enhanceCustomSelects(document);
    return;
  }
  elements.serverConfigContainer.removeClass("hidden");
  elements.serverEmptyState.addClass("hidden");

  elements.serverSelector.empty();
  servers.forEach(s => {
    const selected = s.id === currentId ? "selected" : "";
    const displayName = s.name || s.id;
    elements.serverSelector.append(
      `<option value="${escapeHtml(s.id)}" ${selected}>${escapeHtml(displayName)}</option>`,
    );
  });
  elements.serverSelector.prop("disabled", false);

  const currentServer = getCurrentServer();
  if (currentServer) {
    elements.serverEnabledToggle.prop("checked", currentServer.enabled);
    elements.serverEnabledLabel.attr("data-i18n", currentServer.enabled ? "server_enabled" : "server_disabled");
    elements.serverEnabledLabel.text(t(currentServer.enabled ? "server_enabled" : "server_disabled"));
    elements.serverEnabledLabel.toggleClass("status-on", currentServer.enabled);
    elements.serverEnabledLabel.toggleClass("status-off", !currentServer.enabled);
    elements.currentServerActions.show();
  } else {
    elements.serverEnabledLabel.removeClass("status-on status-off");
    elements.currentServerActions.hide();
  }

  enhanceCustomSelects(document);
}

// ── Server Modal ─────────────────────────────────────────────────

function refreshServerModalText() {
  if (serverModalMode === "edit") {
    elements.serverModalTitle.text(t("edit_server_modal_title"));
    elements.serverModalSaveBtn.text(t("save_server_changes"));
  } else {
    elements.serverModalTitle.text(t("add_server_modal_title"));
    elements.serverModalSaveBtn.text(t("save_and_connect"));
  }
}

function openServerModal(mode = "add") {
  serverModalMode = mode;
  const currentServer = getCurrentServer();

  if (mode === "edit" && currentServer) {
    elements.serverModalIdGroup.removeClass("hidden");
    elements.serverModalId.val(currentServer.id || "").prop("disabled", true);
    elements.serverModalName.val(currentServer.name || currentServer.id || "");
    elements.serverModalUrl.val(currentServer.url || "");
    elements.serverModalOutput.val(currentServer.output_dir || "./outputs");
  } else {
    elements.serverModalIdGroup.removeClass("hidden");
    elements.serverModalId.val("").prop("disabled", false);
    elements.serverModalName.val("");
    elements.serverModalUrl.val("");
    elements.serverModalOutput.val("./outputs");
  }

  refreshServerModalText();
  elements.serverModalOverlay.removeClass("hidden").attr("aria-hidden", "false");
  $("body").addClass("modal-open");
  window.setTimeout(() => {
    if (mode === "edit") {
      elements.serverModalName.trigger("focus");
      return;
    }
    elements.serverModalId.trigger("focus");
  }, 0);
}

function closeServerModal() {
  elements.serverModalOverlay.addClass("hidden").attr("aria-hidden", "true");
  $("body").removeClass("modal-open");
}

function closeConfirmModal(confirmed = false) {
  if (!confirmModalResolver) {
    elements.confirmModalOverlay.addClass("hidden").attr("aria-hidden", "true");
    if (elements.serverModalOverlay.hasClass("hidden")) {
      $("body").removeClass("modal-open");
    }
    return;
  }

  const resolve = confirmModalResolver;
  confirmModalResolver = null;
  const payloadBuilder = confirmModalPayloadBuilder;
  confirmModalPayloadBuilder = null;
  const result = payloadBuilder ? payloadBuilder(confirmed) : confirmed;
  elements.confirmModalOverlay.addClass("hidden").attr("aria-hidden", "true");
  elements.confirmModalConfirmBtn.removeClass("btn-danger").addClass("btn-primary");
  elements.confirmModalCheckboxWrap.addClass("hidden");
  elements.confirmModalCheckbox.prop("checked", false);
  if (elements.serverModalOverlay.hasClass("hidden")) {
    $("body").removeClass("modal-open");
  }
  resolve(result);
}

function openConfirmModal({
  title = t("confirm_action_title"),
  message,
  confirmLabel = t("confirm"),
  cancelLabel = t("cancel"),
  tone = "primary",
  checkbox = null,
}) {
  if (confirmModalResolver) {
    closeConfirmModal(false);
  }

  elements.confirmModalTitle.text(title);
  elements.confirmModalMessage.text(message || "");
  elements.confirmModalCheckboxWrap.addClass("hidden");
  elements.confirmModalCheckbox.prop("checked", false);
  elements.confirmModalCancelBtn.text(cancelLabel);
  elements.confirmModalConfirmBtn
    .text(confirmLabel)
    .toggleClass("btn-danger", tone === "danger")
    .toggleClass("btn-primary", tone !== "danger");

  if (checkbox) {
    elements.confirmModalCheckboxLabel.text(checkbox.label || "");
    elements.confirmModalCheckbox.prop("checked", Boolean(checkbox.checked));
    elements.confirmModalCheckboxWrap.toggleClass("hidden", false);
    confirmModalPayloadBuilder = (confirmed) => ({
      confirmed,
      checked: elements.confirmModalCheckbox.prop("checked"),
    });
  } else {
    confirmModalPayloadBuilder = null;
  }

  elements.confirmModalOverlay.removeClass("hidden").attr("aria-hidden", "false");
  $("body").addClass("modal-open");

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    window.setTimeout(() => {
      elements.confirmModalConfirmBtn.trigger("focus");
    }, 0);
  });
}

function refreshWorkflowPanel() {
  renderWorkflowSummary(elements.workflowSummary);
  renderWorkflowList(elements.workflowList);
}

function getEditorStep() {
  const workflowId = elements.workflowId.val().trim();
  const { currentUploadData } = getState();

  if (!workflowId) {
    return 1;
  }
  if (!currentUploadData) {
    return 2;
  }
  return 3;
}

function refreshEditorProgress() {
  const step = getEditorStep();
  const hints = {
    1: t("editor_step_1_hint"),
    2: t("editor_step_2_hint"),
    3: t("editor_step_3_hint"),
  };

  elements.editorProgressHint.text(hints[step]);

  [
    { element: elements.editorStep1, value: 1 },
    { element: elements.editorStep2, value: 2 },
    { element: elements.editorStep3, value: 3 },
  ].forEach(({ element, value }) => {
    element.toggleClass("is-active", value === step);
    element.toggleClass("is-done", value < step);
  });
}

function refreshMappingSummary(stats) {
  if (!stats || stats.totalParams === 0) {
    elements.mappingSummary.text("");
    return;
  }

  elements.mappingSummary.text(
    t("mapping_summary", {
      visible_params: stats.visibleParams,
      total_params: stats.totalParams,
      exposed_params: stats.totalExposed,
      visible_nodes: stats.visibleNodes,
    }),
  );
}

function refreshEditorPanel() {
  renderEditorMode(elements.editorModeBadge, elements.saveWorkflowButton);
  const stats = renderNodes(elements.nodesContainer, { ...editorFilters, collapsedNodeIds, expandedParamKeys });
  latestEditorStats = stats;
  enhanceCustomSelects(elements.viewEditor[0]);
  refreshMappingSummary(stats);
  refreshEditorProgress();
}

function resetEditorFilters() {
  editorFilters.query = "";
  editorFilters.exposedOnly = false;
  editorFilters.requiredOnly = false;
  editorFilters.nodeSort = "node_id_asc";
  editorFilters.paramSort = "default";
  elements.mappingSearch.val("");
  elements.mappingExposedOnly.prop("checked", false);
  elements.mappingRequiredOnly.prop("checked", false);
  elements.mappingNodeSort.val("node_id_asc");
  elements.mappingParamSort.val("default");
}

function resetCollapsedNodes() {
  collapsedNodeIds.clear();
}

function resetExpandedParamConfigs() {
  expandedParamKeys.clear();
}

function shouldAutoExposeParameter(parameter) {
  if (!parameter || !parameter.field) {
    return false;
  }

  const commonFields = new Set([
    "prompt",
    "text",
    "negative_prompt",
    "seed",
    "steps",
    "cfg",
    "denoise",
    "width",
    "height",
    "batch_size",
    "filename_prefix",
  ]);

  return commonFields.has(parameter.field);
}

function applyRecommendedExposures() {
  const { schemaParams } = getState();
  let changedCount = 0;

  Object.entries(schemaParams).forEach(([key, parameter]) => {
    if (!shouldAutoExposeParameter(parameter) || parameter.exposed) {
      return;
    }

    updateSchemaParam(key, "exposed", true);
    if (!parameter.name || !parameter.name.trim()) {
      updateSchemaParam(key, "name", parameter.field);
    }
    changedCount += 1;
  });

  if (changedCount === 0) {
    showToast(t("mapping_no_recommended_changes"), "success");
    return;
  }

  markEditorDirty(true);
  refreshEditorPanel();
  showToast(t("mapping_apply_recommended_ok", { count: changedCount }), "success");
}

function applyExposeToVisible(shouldExpose) {
  const visibleKeys = latestEditorStats?.visibleParamKeys || [];
  if (!visibleKeys.length) {
    showToast(t("mapping_no_visible_params"), "error");
    return;
  }

  let changedCount = 0;
  visibleKeys.forEach((key) => {
    const parameter = getState().schemaParams[key];
    if (!parameter || parameter.exposed === shouldExpose) {
      return;
    }
    updateSchemaParam(key, "exposed", shouldExpose);
    if (shouldExpose && (!parameter.name || !parameter.name.trim())) {
      updateSchemaParam(key, "name", parameter.field);
    }
    changedCount += 1;
  });

  if (!changedCount) {
    showToast(t("mapping_no_batch_changes"), "success");
    return;
  }

  markEditorDirty(true);
  refreshEditorPanel();
  showToast(
    t(shouldExpose ? "mapping_expose_visible_ok" : "mapping_unexpose_visible_ok", { count: changedCount }),
    "success",
  );
}

function setAllVisibleNodesCollapsed(isCollapsed) {
  const visibleNodeIds = latestEditorStats?.visibleNodeIds || [];
  visibleNodeIds.forEach((nodeId) => {
    if (isCollapsed) {
      collapsedNodeIds.add(String(nodeId));
    } else {
      collapsedNodeIds.delete(String(nodeId));
    }
  });
  refreshEditorPanel();
}

function setAllVisibleParamConfigsExpanded(isExpanded) {
  const visibleExposedParamKeys = latestEditorStats?.visibleExposedParamKeys || [];
  visibleExposedParamKeys.forEach((paramKey) => {
    if (isExpanded) {
      expandedParamKeys.add(String(paramKey));
    } else {
      expandedParamKeys.delete(String(paramKey));
    }
  });
  refreshEditorPanel();
}

function isEditorVisible() {
  return !elements.viewEditor.hasClass("hidden");
}

async function confirmLeaveEditorIfDirty() {
  if (!isEditorVisible() || !hasEditorUnsavedChanges) {
    return true;
  }
  return openConfirmModal({
    message: t("confirm_unsaved_leave"),
    confirmLabel: t("leave_anyway"),
  });
}

function clearEditorFields() {
  elements.workflowId.val("");
  elements.workflowDescription.val("");
  elements.fileUpload.val("");
  lastAutoWorkflowId = "";
}

async function exitEditor() {
  if (!(await confirmLeaveEditorIfDirty())) {
    return false;
  }
  resetMappingState();
  setEditingWorkflowId(null);
  resetEditorFilters();
  resetCollapsedNodes();
  resetExpandedParamConfigs();
  clearEditorFields();
  markEditorDirty(false);
  setEditorVisibility(elements, false);
  refreshEditorPanel();
  showView("main");
  return true;
}

function enterEditor({ workflowData, schemaParams, workflowId = "", description = "", editingWorkflowId = null }) {
  setUploadData(workflowData);
  setSchemaParams(schemaParams);
  setEditingWorkflowId(editingWorkflowId);
  elements.fileUpload.val("");
  elements.workflowId.val(workflowId);
  elements.workflowDescription.val(description);
  lastAutoWorkflowId = "";
  resetEditorFilters();
  resetCollapsedNodes();
  resetExpandedParamConfigs();
  markEditorDirty(false);
  setEditorVisibility(elements, !!workflowData);
  refreshEditorPanel();
  showView("editor");
}

// ── Data Hydration ────────────────────────────────────────────────

function hydrateSchemaParams(workflowData, savedSchemaParams) {
  const extractedParams = extractSchemaParams(workflowData);
  const savedEntries = Object.entries(savedSchemaParams || {});

  const isUiStateShape = savedEntries.some(([, savedParam]) => {
    return savedParam && typeof savedParam === "object" && "exposed" in savedParam;
  });

  if (isUiStateShape) {
    savedEntries.forEach(([key, savedParam]) => {
      if (!extractedParams[key]) {
        return;
      }

      extractedParams[key] = {
        ...extractedParams[key],
        exposed: Boolean(savedParam.exposed),
        name: savedParam.name || extractedParams[key].name,
        type: savedParam.type || extractedParams[key].type,
        required: Boolean(savedParam.required),
        description: savedParam.description || "",
      };
    });

    return extractedParams;
  }

  savedEntries.forEach(([name, savedParam]) => {
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

async function saveServerFromModal() {
  const currentServer = getCurrentServer();
  const id = elements.serverModalId.val().trim();
  const rawName = elements.serverModalName.val().trim();
  const name = rawName || id;
  const url = elements.serverModalUrl.val().trim();
  const output_dir = elements.serverModalOutput.val().trim() || "./outputs";
  let createdServerId = null;

  if (serverModalMode === "edit" && (!id || !name || !url)) {
    showToast(t("err_server_name_id_url_required"), "error");
    return;
  }
  if (serverModalMode === "add" && (!name || !url)) {
    showToast(t("err_server_name_url_required"), "error");
    return;
  }

  if (serverModalMode === "edit" && !currentServer) {
    showToast(t("err_no_server_selected"), "error");
    return;
  }

  setBusy(elements.serverModalSaveBtn, true);
  try {
    if (serverModalMode === "edit") {
      await fetchJSON(`/api/servers/${encodeURIComponent(currentServer.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentServer.id,
          name,
          url,
          enabled: currentServer.enabled,
          output_dir,
        }),
      });
      setCurrentServerId(currentServer.id);
      showToast(t("ok_save_cfg"), "success");
    } else {
      const created = await fetchJSON("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id || null,
          name,
          url,
          enabled: true,
          output_dir,
        }),
      });
      createdServerId = created?.server?.id || null;
    }

    await loadServers();
    if (serverModalMode === "add") {
      if (createdServerId) {
        setCurrentServerId(createdServerId);
      }
      showToast(t("ok_add_server"), "success");
    }
    refreshServerSelector();
    refreshWorkflowPanel();
    closeServerModal();
  } catch (error) {
    showToast(error.message || t(serverModalMode === "edit" ? "err_save_cfg" : "err_add_server"), "error");
  } finally {
    setBusy(elements.serverModalSaveBtn, false);
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
    showToast(
      t(enabled ? "ok_toggle_wf_enabled" : "ok_toggle_wf_disabled", { id: workflowId }),
      "success",
    );
  } catch {
    $checkbox.prop("checked", !$checkbox.prop("checked"));
    showToast(t("err_toggle_wf"), "error");
  } finally {
    $checkbox.prop("disabled", false);
  }
}

async function deleteWorkflow(serverId, workflowId, $button) {
  const confirmed = await openConfirmModal({
    message: t("del_wf_confirm", { id: workflowId }),
    confirmLabel: t("delete"),
    tone: "danger",
  });
  if (!confirmed) {
    return;
  }

  $button.prop("disabled", true);
  try {
    await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`, { method: "DELETE" });
    if (getState().editingWorkflowId === workflowId) {
      await exitEditor();
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
  uiSchemaParams,
}) {
  const savePayload = {
    workflow_id: workflowId,
    server_id: serverId,
    original_workflow_id: originalWorkflowId,
    description,
    workflow_data: workflowData,
    schema_params: schemaParams,
    ui_schema_params: uiSchemaParams,
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

    const confirmed = await openConfirmModal({
      message: t("warn_overwrite_wf", { id: workflowId }),
      confirmLabel: t("overwrite"),
      tone: "danger",
    });
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
    showToast(t("err_no_server_selected"), "error");
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

  if (exposedCount === 0 && !(await openConfirmModal({
    message: t("warn_no_params"),
    confirmLabel: t("save_anyway"),
  }))) {
    return;
  }

  // Prepare workflowData. If new upload, use currentUploadData.
  // If editing and no new upload, backend requires us to resend existing data,
  // but we skip the "need upload" check if editingWorkflowId is set.
  if (!currentUploadData && !editingWorkflowId) {
    showToast(t("err_no_workflow_uploaded"), "error");
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
      uiSchemaParams: schemaParams,
    });
    showToast(t("ok_save_wf"), "success");
    setEditingWorkflowId(workflowId);
    markEditorDirty(false);
    await loadWorkflows();
    refreshEditorPanel();
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
    showToast(t("err_select_server_first"), "error");
    return;
  }

  try {
    const fileContents = await readFile(file);
    const parsed = parseWorkflowUpload(fileContents);
    const newSchema = { ...parsed.schemaParams };
    const suggestedWorkflowId = suggestWorkflowId(parsed.workflowData, file.name);
    const currentWorkflowId = elements.workflowId.val().trim();
    const shouldAutofillWorkflowId = !getState().editingWorkflowId
      && (!currentWorkflowId || currentWorkflowId === lastAutoWorkflowId);

    if (shouldAutofillWorkflowId) {
      elements.workflowId.val(suggestedWorkflowId);
      lastAutoWorkflowId = suggestedWorkflowId;
    }

    setUploadData(parsed.workflowData);
    setSchemaParams(newSchema);
    markEditorDirty(true);
    resetCollapsedNodes();

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
  const currentLanguage = getState().currentLang;
  setLanguage(currentLanguage);
  elements.langSelect.val(currentLanguage);
  applyTranslations();
  enhanceCustomSelects(document);
  refreshServerModalText();
  refreshServerSelector();
  if (!elements.viewMain.hasClass("hidden")) {
    refreshWorkflowPanel();
  }
  if (!elements.viewEditor.hasClass("hidden")) {
    refreshEditorPanel();
  }
}

function bindServerEvents() {
  elements.serverSelector.on("change", function () {
    const sid = $(this).val();
    setCurrentServerId(sid);
    refreshServerSelector(); // updates config inputs
    refreshWorkflowPanel(); // updates workflow list
  });

  elements.btnToggleAddServer.on("click", () => openServerModal("add"));
  elements.btnEmptyAddServer.on("click", () => openServerModal("add"));
  elements.btnEditServer.on("click", () => openServerModal("edit"));
  elements.serverModalCloseBtn.on("click", closeServerModal);
  elements.serverModalSaveBtn.on("click", saveServerFromModal);

  elements.serverModalOverlay.on("click", (event) => {
    if (event.target === elements.serverModalOverlay[0]) {
      closeServerModal();
    }
  });

  elements.confirmModalCancelBtn.on("click", () => closeConfirmModal(false));
  elements.confirmModalConfirmBtn.on("click", () => closeConfirmModal(true));
  elements.confirmModalOverlay.on("click", (event) => {
    if (event.target === elements.confirmModalOverlay[0]) {
      closeConfirmModal(false);
    }
  });

  $(document).on("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!elements.confirmModalOverlay.hasClass("hidden")) {
      closeConfirmModal(false);
      return;
    }
    if (!elements.serverModalOverlay.hasClass("hidden")) {
      closeServerModal();
    }
  });

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
      showToast(
        t(enabled ? "ok_toggle_server_enabled" : "ok_toggle_server_disabled", {
          id: currentServer.name || currentServer.id,
        }),
        "success",
      );
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

    const result = await openConfirmModal({
      message: t("del_server_confirm", { id: currentServer.id }),
      confirmLabel: t("delete"),
      tone: "danger",
      checkbox: {
        label: t("delete_server_data_checkbox"),
        checked: false,
      },
    });
    if (!result.confirmed) {
      return;
    }

    const $btn = $(this);
    $btn.prop("disabled", true);
    try {
      const deleteUrl = `/api/servers/${encodeURIComponent(currentServer.id)}?delete_data=${result.checked ? "true" : "false"}`;
      await fetchJSON(deleteUrl, { method: "DELETE" });
      await loadServers();
      refreshWorkflowPanel();
      showToast(t(result.checked ? "ok_del_server_with_data" : "ok_del_server_keep_data"), "success");
    } catch (e) {
      showToast(t("err_del_server"), "error");
    } finally {
      $btn.prop("disabled", false);
    }
  });
}

function bindWorkflowEvents() {
  // New Workflow
  elements.addWorkflowBtn.on("click", () => {
    if (!getCurrentServerId()) {
      showToast(t("err_select_server_before_register"), "error");
      return;
    }
    enterEditor({ workflowData: null, schemaParams: {} });
  });

  elements.editorBackBtn.on("click", async () => {
    await exitEditor();
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
    markEditorDirty(true);

    if (field === "exposed") {
      if (!value) {
        expandedParamKeys.delete(String(paramKey));
      }
      refreshEditorPanel();
    }
  });

  elements.nodesContainer.on("click", "button[data-action='toggle-node']", function () {
    const nodeId = String($(this).data("nodeId"));
    if (collapsedNodeIds.has(nodeId)) {
      collapsedNodeIds.delete(nodeId);
    } else {
      collapsedNodeIds.add(nodeId);
    }
    refreshEditorPanel();
  });

  elements.nodesContainer.on("click", "button[data-action='toggle-param-config']", function () {
    const paramKey = String($(this).data("paramKey"));
    if (expandedParamKeys.has(paramKey)) {
      expandedParamKeys.delete(paramKey);
    } else {
      expandedParamKeys.add(paramKey);
    }
    refreshEditorPanel();
  });
}

function bindMappingToolbarEvents() {
  elements.mappingSearch.on("input", function () {
    editorFilters.query = $(this).val().trim();
    refreshEditorPanel();
  });

  elements.mappingExposedOnly.on("change", function () {
    editorFilters.exposedOnly = $(this).prop("checked");
    refreshEditorPanel();
  });

  elements.mappingRequiredOnly.on("change", function () {
    editorFilters.requiredOnly = $(this).prop("checked");
    refreshEditorPanel();
  });

  elements.mappingNodeSort.on("change", function () {
    editorFilters.nodeSort = $(this).val();
    refreshEditorPanel();
  });

  elements.mappingParamSort.on("change", function () {
    editorFilters.paramSort = $(this).val();
    refreshEditorPanel();
  });

  elements.mappingResetFiltersButton.on("click", () => {
    resetEditorFilters();
    refreshEditorPanel();
  });

  elements.mappingExposeRecommendedButton.on("click", () => {
    applyRecommendedExposures();
  });

  elements.mappingExposeVisibleButton.on("click", () => {
    applyExposeToVisible(true);
  });

  elements.mappingUnexposeVisibleButton.on("click", () => {
    applyExposeToVisible(false);
  });

  elements.mappingCollapseAllButton.on("click", () => {
    setAllVisibleNodesCollapsed(true);
  });

  elements.mappingExpandAllButton.on("click", () => {
    setAllVisibleNodesCollapsed(false);
  });

  elements.workflowId.on("input", () => {
    if (elements.workflowId.val().trim() !== lastAutoWorkflowId) {
      lastAutoWorkflowId = "";
    }
    markEditorDirty(true);
    refreshEditorProgress();
  });

  elements.workflowDescription.on("input", () => {
    markEditorDirty(true);
    refreshEditorProgress();
  });
}

function bindEditorShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (!isEditorVisible()) {
      return;
    }

    const isInputLike = event.target instanceof HTMLElement
      && (event.target.tagName === "INPUT"
        || event.target.tagName === "TEXTAREA"
        || event.target.tagName === "SELECT"
        || event.target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveWorkflow();
      return;
    }

    if (!isInputLike && event.key === "/") {
      event.preventDefault();
      elements.mappingSearch.trigger("focus");
      return;
    }

    if (event.key === "Escape" && elements.mappingSearch.is(":focus") && elements.mappingSearch.val()) {
      elements.mappingSearch.val("");
      editorFilters.query = "";
      refreshEditorPanel();
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
  elements.langSelect.on("change", function () {
    const nextLanguage = $(this).val();
    if (nextLanguage === getState().currentLang) {
      return;
    }
    setLanguage(nextLanguage);
    applyTranslations();
    enhanceCustomSelects(document);
    refreshServerModalText();
    refreshServerSelector();
    if (!elements.viewMain.hasClass("hidden")) {
      refreshWorkflowPanel();
    }
    if (!elements.viewEditor.hasClass("hidden")) {
      refreshEditorPanel();
    }
  });

  elements.saveWorkflowButton.on("click", saveWorkflow);

  bindServerEvents();
  bindWorkflowEvents();
  bindNodeFieldUpdates();
  bindMappingToolbarEvents();
  bindEditorShortcuts();
  bindUploadInteractions();

  window.addEventListener("beforeunload", (event) => {
    if (!isEditorVisible() || !hasEditorUnsavedChanges) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
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

  initPixelBlastBackground({
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
    liquid: false,
    liquidStrength: 0.12,
    liquidRadius: 1.2,
    liquidWobbleSpeed: 5,
    speed: 0.5,
    edgeFade: 0.25,
    transparent: true,
  });

  elements = getElements();
  syncLanguage();
  bindEvents();

  // Show Main View initially
  showView("main");
  renderEmptyNodes(elements.nodesContainer);
  enhanceCustomSelects(document);

  // Load servers first, then workflows
  await loadServers();
  await loadWorkflows();
}

init();
