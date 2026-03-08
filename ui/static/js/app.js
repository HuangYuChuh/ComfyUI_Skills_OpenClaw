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
import { scrollToElement, setBusy } from "./ui-utils.js";

let elements;

function $(...args) {
  return window.jQuery(...args);
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
}

function enterEditor({ workflowData, schemaParams, workflowId = "", description = "", editingWorkflowId = null }) {
  setUploadData(workflowData);
  setSchemaParams(schemaParams);
  setEditingWorkflowId(editingWorkflowId);
  elements.fileUpload.val("");
  elements.workflowId.val(workflowId);
  elements.workflowDescription.val(description);
  setEditorVisibility(elements, true);
  refreshEditorPanel();
}

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

async function loadConfig() {
  try {
    const config = await fetchJSON("/api/config");
    elements.configUrl.val(config.comfyui_server_url || "");
    elements.configOutput.val(config.output_dir || "");
  } catch {
    showToast(t("err_load_cfg"), "error");
  }
}

async function saveConfig() {
  setBusy(elements.saveConfigButton, true);
  try {
    await fetchJSON("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comfyui_server_url: elements.configUrl.val().trim(),
        output_dir: elements.configOutput.val().trim(),
      }),
    });
    showToast(t("ok_save_cfg"), "success");
  } catch (error) {
    showToast(error.message || t("err_save_cfg"), "error");
  } finally {
    setBusy(elements.saveConfigButton, false);
  }
}

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

async function loadWorkflowForEditing(workflowId, $button) {
  if ($button?.length) {
    $button.prop("disabled", true);
  }

  try {
    const data = await fetchJSON(`/api/workflow/${encodeURIComponent(workflowId)}`);
    enterEditor({
      workflowData: data.workflow_data,
      schemaParams: hydrateSchemaParams(data.workflow_data, data.schema_params),
      workflowId: data.workflow_id || workflowId,
      description: data.description || "",
      editingWorkflowId: data.workflow_id || workflowId,
    });
    scrollToElement(elements.mappingSection, 20);
    showToast(t("ok_load_saved_wf"), "success");
  } catch (error) {
    showToast(error.message || t("err_load_saved_wf"), "error");
  } finally {
    if ($button?.length) {
      $button.prop("disabled", false);
    }
  }
}

async function toggleWorkflowStatus(workflowId, $checkbox) {
  $checkbox.prop("disabled", true);
  try {
    const enabled = $checkbox.prop("checked");
    await fetchJSON(`/api/workflow/${encodeURIComponent(workflowId)}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });

    const updatedWorkflows = getState().workflows.map((workflow) =>
      workflow.id === workflowId ? { ...workflow, enabled } : workflow,
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

async function deleteWorkflow(workflowId, $button) {
  if (!window.confirm(t("del_wf_confirm", { id: workflowId }))) {
    return;
  }

  $button.prop("disabled", true);
  try {
    await fetchJSON(`/api/workflow/${encodeURIComponent(workflowId)}`, { method: "DELETE" });
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
  if (!file) {
    return;
  }

  try {
    const fileContents = await readFile(file);
    const parsed = parseWorkflowUpload(fileContents);
    enterEditor({
      workflowData: parsed.workflowData,
      schemaParams: parsed.schemaParams,
    });
    clearEditorFields();
    showToast(t("ok_wf_load"), "success");
  } catch (error) {
    const uploadError = getUploadErrorMessage(error);
    showToast(uploadError.message, "error", uploadError.duration);
  }
}

async function saveWorkflow() {
  const workflowId = elements.workflowId.val().trim();
  const description = elements.workflowDescription.val().trim();
  const { currentUploadData, schemaParams, editingWorkflowId } = getState();

  if (!workflowId) {
    showToast(t("err_no_id"), "error");
    return;
  }

  const { finalSchema, exposedCount, missingAlias } = buildFinalSchema(schemaParams);
  if (missingAlias) {
    showToast(t("err_no_alias", { node: missingAlias.node_id, val: missingAlias.field }), "error");
    return;
  }

  if (exposedCount === 0 && !window.confirm(t("warn_no_params"))) {
    return;
  }

  setBusy(elements.saveWorkflowButton, true);
  try {
    await requestSaveWorkflow({
      workflowId,
      originalWorkflowId: editingWorkflowId,
      description,
      workflowData: currentUploadData,
      schemaParams: finalSchema,
    });
    showToast(t("ok_save_wf"), "success");
    await loadWorkflows();
    exitEditor();
    scrollToElement(elements.workflowList, 32);
  } catch (error) {
    if (error?.cancelled) {
      return;
    }
    showToast(error.message || t("err_save_wf"), "error");
  } finally {
    setBusy(elements.saveWorkflowButton, false);
  }
}

async function requestSaveWorkflow({
  workflowId,
  originalWorkflowId,
  description,
  workflowData,
  schemaParams,
}) {
  const savePayload = {
    workflow_id: workflowId,
    original_workflow_id: originalWorkflowId,
    description,
    workflow_data: workflowData,
    schema_params: schemaParams,
    overwrite_existing: false,
  };

  try {
    return await fetchJSON("/api/workflow/save", {
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

    return fetchJSON("/api/workflow/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...savePayload,
        overwrite_existing: true,
      }),
    });
  }
}

function syncLanguage() {
  setLanguage(getState().currentLang);
  applyTranslations();
  refreshWorkflowPanel();
  refreshEditorPanel();
}

function bindWorkflowEvents() {
  elements.workflowList.on("click", "button[data-action='delete-workflow']", function () {
    const $button = $(this);
    const workflowId = $button.closest("[data-workflow-id]").data("workflowId");
    deleteWorkflow(workflowId, $button);
  });

  elements.workflowList.on("click", "button[data-action='edit-workflow']", function () {
    const $button = $(this);
    const workflowId = $button.closest("[data-workflow-id]").data("workflowId");
    loadWorkflowForEditing(workflowId, $button);
  });

  elements.workflowList.on("change", "input[data-action='toggle-workflow']", function () {
    const $checkbox = $(this);
    const workflowId = $checkbox.closest("[data-workflow-id]").data("workflowId");
    toggleWorkflowStatus(workflowId, $checkbox);
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
    refreshWorkflowPanel();
    refreshEditorPanel();
  });

  elements.saveConfigButton.on("click", saveConfig);
  elements.saveWorkflowButton.on("click", saveWorkflow);
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
  renderEmptyNodes(elements.nodesContainer);
  await Promise.all([loadConfig(), loadWorkflows()]);
}

init();
