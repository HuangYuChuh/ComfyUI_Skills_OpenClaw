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
import {
  buildFinalSchema,
  extractSchemaParams,
  migrateSchemaParams,
  parseWorkflowUpload,
  suggestWorkflowId,
} from "./workflow-mapper.js";
import { scrollToElement, setBusy, escapeHtml } from "./ui-utils.js";

let elements;
const editorFilters = {
  query: "",
  exposedOnly: false,
  requiredOnly: false,
  nodeSort: "node_id_asc",
  paramSort: "default",
};
const workflowListFilters = {
  query: "",
  sort: "custom",
};
const collapsedNodeIds = new Set();
const expandedParamKeys = new Set();
let latestEditorStats = null;
let hasEditorUnsavedChanges = false;
let serverModalMode = "add";
let confirmModalResolver = null;
let confirmModalPayloadBuilder = null;
let transferModalResolver = null;
let transferModalPayloadBuilder = null;
let transferModalMode = null;
let transferPreviewRequestId = 0;
let lastTransferExportPreview = null;
let lastTransferImportPreview = null;
let lastAutoWorkflowId = "";
let draggedWorkflowId = null;
let currentUpgradeSummary = null;
let pendingWorkflowVersionTarget = null;

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

function syncModalBodyState() {
  const hasOpenModal = !elements.serverModalOverlay.hasClass("hidden")
    || !elements.confirmModalOverlay.hasClass("hidden")
    || !elements.transferModalOverlay.hasClass("hidden");
  $("body").toggleClass("modal-open", hasOpenModal);
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
  syncModalBodyState();
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
  syncModalBodyState();
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
  syncModalBodyState();
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
  syncModalBodyState();

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    window.setTimeout(() => {
      elements.confirmModalConfirmBtn.trigger("focus");
    }, 0);
  });
}

function closeTransferModal(confirmed = false) {
  if (!transferModalResolver) {
    elements.transferModalOverlay.addClass("hidden").attr("aria-hidden", "true");
    syncModalBodyState();
    return;
  }

  const resolve = transferModalResolver;
  transferModalResolver = null;
  const payloadBuilder = transferModalPayloadBuilder;
  transferModalPayloadBuilder = null;
  transferModalMode = null;
  const result = payloadBuilder ? payloadBuilder(confirmed) : confirmed;
  elements.transferModalOverlay.addClass("hidden").attr("aria-hidden", "true");
  elements.transferExportPanel.addClass("hidden");
  elements.transferImportPanel.addClass("hidden");
  elements.transferModalConfirmBtn.removeClass("btn-danger").addClass("btn-primary").prop("disabled", false);
  syncModalBodyState();
  resolve(result);
}

function openTransferModal({
  title,
  confirmLabel,
  mode,
  payloadBuilder,
}) {
  if (transferModalResolver) {
    closeTransferModal(false);
  }

  transferModalMode = mode;
  transferModalPayloadBuilder = payloadBuilder || null;
  elements.transferModalTitle.text(title);
  elements.transferModalConfirmBtn.text(confirmLabel).removeClass("btn-danger").addClass("btn-primary");
  elements.transferModalCancelBtn.text(t("cancel"));
  elements.transferExportPanel.toggleClass("hidden", mode !== "export");
  elements.transferImportPanel.toggleClass("hidden", mode !== "import");
  elements.transferModalOverlay.removeClass("hidden").attr("aria-hidden", "false");
  syncModalBodyState();

  return new Promise((resolve) => {
    transferModalResolver = resolve;
    window.setTimeout(() => {
      elements.transferModalConfirmBtn.trigger("focus");
    }, 0);
  });
}

function renderTransferWarningBox($target, warnings = []) {
  if (!warnings.length) {
    $target.addClass("hidden").empty();
    return;
  }

  $target
    .removeClass("hidden")
    .html(`
      <p class="transfer-warning-title">${escapeHtml(t("transfer_warning_title"))}</p>
      ${warnings
        .map((warning) => `<p class="transfer-warning-item">${escapeHtml(warning?.message || "")}</p>`)
        .join("")}
    `);
}

function refreshExportPanelCopy() {
  elements.transferExportHint.text(t("export_panel_hint"));
  elements.transferImportApplyEnvironmentLabel.text(t("transfer_apply_environment"));
}

function buildTransferSectionMarkup(title, items) {
  if (!items.length) {
    return `
      <section class="transfer-section">
        <h4 class="transfer-section-title">${escapeHtml(title)}</h4>
        <p class="transfer-empty">${escapeHtml(t("transfer_section_empty"))}</p>
      </section>
    `;
  }

  return `
    <section class="transfer-section">
      <h4 class="transfer-section-title">${escapeHtml(title)}</h4>
      <ul class="transfer-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function formatPlanItems(items = []) {
  return items.map((item) => {
    if (item?.workflow_id) {
      return `${item.server_id}/${item.workflow_id}`;
    }
    return String(item?.server_id || "");
  }).filter(Boolean);
}

function renderImportPreviewModal(preview) {
  lastTransferImportPreview = preview;
  const plan = preview?.plan || {};
  const warnings = Array.isArray(plan.warnings) ? plan.warnings : [];

  elements.transferImportSummary.text(buildTransferPreviewMessage(plan));
  elements.transferImportApplyEnvironment.prop("checked", false);
  elements.transferImportSections.html([
    buildTransferSectionMarkup(t("transfer_section_created_servers"), formatPlanItems(plan.created_servers || [])),
    buildTransferSectionMarkup(t("transfer_section_updated_servers"), formatPlanItems(plan.updated_servers || [])),
    buildTransferSectionMarkup(t("transfer_section_created_workflows"), formatPlanItems(plan.created_workflows || [])),
    buildTransferSectionMarkup(t("transfer_section_overwritten_workflows"), formatPlanItems(plan.overwritten_workflows || [])),
    buildTransferSectionMarkup(t("transfer_section_skipped_items"), formatPlanItems(plan.skipped_items || [])),
    warnings.length
      ? buildTransferSectionMarkup(
        t("transfer_warning_title"),
        warnings.map((warning) => warning?.message || "").filter(Boolean),
      )
      : "",
  ].join(""));
}

function buildExportSelectionMap() {
  const selection = {};
  elements.transferExportTree.find("[data-export-workflow-checkbox]").each(function () {
    const $checkbox = $(this);
    if (!$checkbox.prop("checked")) {
      return;
    }
    const serverId = String($checkbox.data("serverId") || "");
    const workflowId = String($checkbox.data("workflowId") || "");
    if (!serverId || !workflowId) {
      return;
    }
    selection[serverId] = selection[serverId] || new Set();
    selection[serverId].add(workflowId);
  });
  return selection;
}

function buildExportAccordionState() {
  const state = {};
  elements.transferExportTree.find("[data-export-server]").each(function () {
    const $server = $(this);
    state[String($server.data("exportServer") || "")] = $server.hasClass("is-open");
  });
  return state;
}

function setExportAccordionOpen(serverId, shouldOpen) {
  const $server = elements.transferExportTree.find(`[data-export-server="${serverId}"]`);
  const $body = elements.transferExportTree.find(`[data-export-accordion-body="${serverId}"]`);
  const $toggle = elements.transferExportTree.find(`[data-export-toggle="${serverId}"]`);

  if (!$server.length || !$body.length || !$toggle.length) {
    return;
  }

  $server.toggleClass("is-open", shouldOpen);
  $toggle.attr("aria-expanded", shouldOpen ? "true" : "false");
  $body.css("max-height", shouldOpen ? `${$body[0].scrollHeight}px` : "0px");
}

function buildExportSelectionPayload() {
  const selectionMap = buildExportSelectionMap();
  return {
    servers: Object.entries(selectionMap)
      .map(([serverId, workflowIds]) => ({
        server_id: serverId,
        workflow_ids: [...workflowIds].sort((a, b) => a.localeCompare(b)),
      }))
      .filter((server) => server.workflow_ids.length > 0),
  };
}

function syncExportServerCheckboxState(serverId) {
  const $serverCheckbox = elements.transferExportTree.find(`[data-export-server-checkbox][data-server-id="${serverId}"]`);
  const $workflowCheckboxes = elements.transferExportTree.find(`[data-export-workflow-checkbox][data-server-id="${serverId}"]`);
  const $selectionChip = elements.transferExportTree.find(`[data-export-selection-chip][data-server-id="${serverId}"]`);
  const selectedCount = $workflowCheckboxes.filter(":checked").length;
  const totalCount = $workflowCheckboxes.length;
  $serverCheckbox.prop("checked", totalCount > 0 && selectedCount === totalCount);
  $serverCheckbox.prop("indeterminate", selectedCount > 0 && selectedCount < totalCount);
  $selectionChip.text(t("export_selected_count", { selected: selectedCount, total: totalCount }));
}

function updateExportSummaryFromSelection() {
  const selectionPayload = buildExportSelectionPayload();
  const selectedServers = selectionPayload.servers.length;
  const selectedWorkflows = selectionPayload.servers.reduce((count, server) => count + server.workflow_ids.length, 0);
  const warnings = lastTransferExportPreview?.summary?.warnings || 0;
  elements.transferExportSummary.text(t("export_preview_summary", {
    servers: selectedServers,
    workflows: selectedWorkflows,
    warnings,
  }));
  elements.transferModalConfirmBtn.prop("disabled", selectedWorkflows === 0);
}

function renderExportSelectionTree(preview, selectionMap = null, accordionState = null) {
  const serverMarkup = (preview?.servers || []).map((server) => {
    const serverId = String(server.server_id || "");
    const workflows = Array.isArray(server.workflows) ? server.workflows : [];
    const selectedWorkflows = selectionMap?.[serverId] || new Set(workflows.map((workflow) => workflow.workflow_id));
    const selectedCount = workflows.filter((workflow) => selectedWorkflows.has(workflow.workflow_id)).length;
    const isOpen = Boolean(accordionState?.[serverId]);

    return `
      <section class="transfer-export-server ${isOpen ? "is-open" : ""}" data-export-server="${escapeHtml(serverId)}">
        <div class="transfer-export-server-head">
          <label class="transfer-export-item" for="export-server-${escapeHtml(serverId)}">
            <input
              id="export-server-${escapeHtml(serverId)}"
              type="checkbox"
              data-export-server-checkbox
              data-server-id="${escapeHtml(serverId)}"
              ${selectedCount > 0 ? "checked" : ""}
            >
            <span class="transfer-export-server-copy">
              <span class="transfer-export-server-title-row">
                <span class="transfer-option-title">${escapeHtml(server.name || serverId)}</span>
                <span class="transfer-export-server-pills">
                  <span
                    class="transfer-chip transfer-chip-accent"
                    data-export-selection-chip
                    data-server-id="${escapeHtml(serverId)}"
                  >
                    ${escapeHtml(t("export_selected_count", { selected: selectedCount, total: workflows.length }))}
                  </span>
                  ${!server.enabled
                    ? `<span class="transfer-chip transfer-chip-muted">${escapeHtml(t("export_server_disabled"))}</span>`
                    : ""}
                </span>
              </span>
              <span class="transfer-export-server-meta">${escapeHtml(serverId)} · ${escapeHtml(t("export_server_workflow_count", { count: workflows.length }))}</span>
            </span>
          </label>
          <button
            type="button"
            class="transfer-export-toggle"
            data-export-toggle="${escapeHtml(serverId)}"
            aria-expanded="${isOpen ? "true" : "false"}"
            aria-controls="export-workflows-${escapeHtml(serverId)}"
            aria-label="${escapeHtml(t("export_toggle_server", { server: server.name || serverId }))}"
          >
            <span class="transfer-export-chevron" aria-hidden="true"></span>
          </button>
        </div>
        <div
          id="export-workflows-${escapeHtml(serverId)}"
          class="transfer-export-workflows-wrap"
          data-export-accordion-body="${escapeHtml(serverId)}"
          style="max-height:${isOpen ? "999px" : "0px"}"
        >
          <div class="transfer-export-workflows">
          ${workflows.map((workflow) => `
            <label class="transfer-export-item" for="export-workflow-${escapeHtml(serverId)}-${escapeHtml(workflow.workflow_id)}">
              <input
                id="export-workflow-${escapeHtml(serverId)}-${escapeHtml(workflow.workflow_id)}"
                type="checkbox"
                data-export-workflow-checkbox
                data-server-id="${escapeHtml(serverId)}"
                data-workflow-id="${escapeHtml(workflow.workflow_id)}"
                ${selectedWorkflows.has(workflow.workflow_id) ? "checked" : ""}
              >
              <span class="transfer-export-item-copy">
                <span class="transfer-export-workflow-title-row">
                  <span class="transfer-option-title">${escapeHtml(workflow.workflow_id)}</span>
                  ${!workflow.enabled
                    ? `<span class="transfer-chip transfer-chip-muted">${escapeHtml(t("export_workflow_disabled"))}</span>`
                    : ""}
                </span>
                ${workflow.description || !workflow.enabled
                  ? `<span class="transfer-export-item-meta">${escapeHtml(workflow.description || t("export_workflow_disabled"))}</span>`
                  : ""}
              </span>
            </label>
          `).join("")}
          </div>
        </div>
      </section>
    `;
  }).join("");

  elements.transferExportTree.html(serverMarkup || `<p class="transfer-empty">${escapeHtml(t("transfer_section_empty"))}</p>`);
  (preview?.servers || []).forEach((server) => {
    const serverId = String(server.server_id || "");
    syncExportServerCheckboxState(serverId);
    setExportAccordionOpen(serverId, Boolean(accordionState?.[serverId]));
  });
  updateExportSummaryFromSelection();
}

function refreshTransferModalLanguage() {
  refreshExportPanelCopy();

  if (transferModalMode === "export") {
    elements.transferModalTitle.text(t("export_bundle_title"));
    elements.transferModalConfirmBtn.text(t("export_bundle_confirm"));
    if (lastTransferExportPreview) {
      renderExportPreview(
        lastTransferExportPreview,
        buildExportSelectionMap(),
        buildExportAccordionState(),
      );
    }
    return;
  }

  if (transferModalMode === "import") {
    elements.transferModalTitle.text(t("import_bundle_preview_title"));
    elements.transferModalConfirmBtn.text(t("import_bundle_confirm"));
    if (lastTransferImportPreview) {
      renderImportPreviewModal(lastTransferImportPreview);
    }
  }
}

function refreshWorkflowPanel() {
  const serverWorkflows = getCurrentServerWorkflows();
  const visibleWorkflows = getVisibleWorkflows();
  renderWorkflowSummary(elements.workflowSummary, visibleWorkflows);
  renderWorkflowList(elements.workflowList, visibleWorkflows, {
    isCustomOrder: workflowListFilters.sort === "custom",
    dragEnabled: canDragReorderWorkflows(),
    hasAnyWorkflows: serverWorkflows.length > 0,
  });
}

function getCurrentServerWorkflows() {
  const { workflows } = getState();
  const serverId = getCurrentServerId();
  return workflows.filter((workflow) => workflow.server_id === serverId);
}

function getVisibleWorkflows() {
  const query = workflowListFilters.query.trim().toLowerCase();
  const sorted = sortWorkflows(getCurrentServerWorkflows(), workflowListFilters.sort);

  if (!query) {
    return sorted;
  }

  return sorted.filter((workflow) => {
    const haystacks = [
      workflow.id,
      workflow.description,
      workflow.server_name,
      workflow.server_id,
    ];

    return haystacks.some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function sortWorkflows(workflows, sortMode) {
  const items = [...workflows];

  switch (sortMode) {
    case "updated_desc":
      return items.sort((first, second) => (second.updated_at || 0) - (first.updated_at || 0));
    case "name_asc":
      return items.sort((first, second) => String(first.id).localeCompare(String(second.id)));
    case "name_desc":
      return items.sort((first, second) => String(second.id).localeCompare(String(first.id)));
    case "enabled_first":
      return items.sort((first, second) => {
        if (Boolean(first.enabled) !== Boolean(second.enabled)) {
          return first.enabled ? -1 : 1;
        }
        return String(first.id).localeCompare(String(second.id));
      });
    case "custom":
    default:
      return items;
  }
}

function canDragReorderWorkflows() {
  return workflowListFilters.sort === "custom" && !workflowListFilters.query.trim();
}

function reorderCurrentServerWorkflows(sourceWorkflowId, targetWorkflowId, placeAfter = false) {
  const state = getState();
  const currentServerId = getCurrentServerId();
  const serverWorkflows = state.workflows.filter((workflow) => workflow.server_id === currentServerId);
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

  return [
    ...state.workflows.filter((workflow) => workflow.server_id !== currentServerId),
    ...reorderedServerWorkflows,
  ];
}

async function persistWorkflowOrder(serverId, workflowIds) {
  await fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflows/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow_ids: workflowIds }),
  });
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
  renderUpgradeSummaryBanner();
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
  currentUpgradeSummary = null;
  renderUpgradeSummaryBanner();
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

function enterEditor({
  workflowData,
  schemaParams,
  workflowId = "",
  description = "",
  editingWorkflowId = null,
  upgradeSummary = null,
}) {
  setUploadData(workflowData);
  setSchemaParams(schemaParams);
  setEditingWorkflowId(editingWorkflowId);
  currentUpgradeSummary = upgradeSummary;
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

function renderUpgradeSummaryBanner() {
  if (!elements?.upgradeSummaryBanner?.length) {
    return;
  }

  if (!currentUpgradeSummary) {
    elements.upgradeSummaryBanner.addClass("hidden").empty();
    return;
  }

  elements.upgradeSummaryBanner
    .removeClass("hidden")
    .html(`
      <div class="upgrade-summary-title">${escapeHtml(t("workflow_upgrade_ready"))}</div>
      <div class="upgrade-summary-meta">${escapeHtml(t("workflow_upgrade_summary", currentUpgradeSummary))}</div>
    `);
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

async function getWorkflowDetail(serverId, workflowId) {
  return fetchJSON(`/api/servers/${encodeURIComponent(serverId)}/workflow/${encodeURIComponent(workflowId)}`);
}

function closeWorkflowMoreMenus() {
  elements.workflowList.find(".workflow-more").removeClass("is-open");
  elements.workflowList.find(".workflow-more-menu").addClass("hidden");
  elements.workflowList.find("[data-action='toggle-workflow-menu']").attr("aria-expanded", "false");
}

function openWorkflowVersionPicker(target) {
  pendingWorkflowVersionTarget = target;
  elements.workflowVersionUpload.val("");
  elements.workflowVersionUpload.trigger("click");
}

async function applyWorkflowUpgrade(target, file) {
  const fileContents = await readFile(file);
  const parsed = parseWorkflowUpload(fileContents);
  const previousSchemaParams = hydrateSchemaParams(target.workflow_data, target.schema_params);
  const migration = migrateSchemaParams(previousSchemaParams, parsed.schemaParams);

  currentUpgradeSummary = migration.summary;
  enterEditor({
    workflowData: parsed.workflowData,
    schemaParams: migration.schemaParams,
    workflowId: target.workflow_id || "",
    description: target.description || "",
    editingWorkflowId: target.workflow_id || "",
    upgradeSummary: migration.summary,
  });
  markEditorDirty(true);
  showToast(t("workflow_upgrade_summary", migration.summary), "success", 4200);
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
    renderWorkflowSummary(elements.workflowSummary, []);
    elements.workflowList.html(`<div class="empty-state">${t("err_load_workflows")}</div>`);
  }
}

function getTransferErrorMessage(error, fallbackKey) {
  const issues = error?.detail?.errors || error?.detail?.validation?.errors;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((issue) => issue?.message)
      .filter(Boolean)
      .join("; ");
  }
  return error?.message || t(fallbackKey);
}

function buildTransferPreviewMessage(plan) {
  const summary = plan?.summary || {};
  return t("transfer_preview_summary", {
    servers: summary.created_servers || 0,
    updated_servers: summary.updated_servers || 0,
    created: summary.created_workflows || 0,
    overwritten: summary.overwritten_workflows || 0,
    skipped: summary.skipped_items || 0,
    warnings: summary.warnings || 0,
  });
}

async function fetchExportPreview() {
  return fetchJSON("/api/transfer/export/preview");
}

function renderExportPreview(preview, selectionMap = null, accordionState = null) {
  lastTransferExportPreview = preview;
  const baseSelection = selectionMap || Object.fromEntries(
    (preview?.servers || []).map((server) => [
      String(server.server_id || ""),
      new Set((server.workflows || []).map((workflow) => workflow.workflow_id)),
    ]),
  );
  renderExportSelectionTree(preview, baseSelection, accordionState);
  renderTransferWarningBox(elements.transferExportWarnings, preview?.warnings || []);
}

async function refreshExportPreview() {
  const requestId = ++transferPreviewRequestId;
  let loaded = false;
  elements.transferModalConfirmBtn.prop("disabled", true);
  elements.transferExportSummary.text(t("loading"));
  renderTransferWarningBox(elements.transferExportWarnings, []);

  try {
    const preview = await fetchExportPreview();
    if (requestId !== transferPreviewRequestId || transferModalMode !== "export") {
      return;
    }
    renderExportPreview(preview);
    loaded = true;
  } catch (error) {
    if (requestId !== transferPreviewRequestId || transferModalMode !== "export") {
      return;
    }
    elements.transferExportSummary.text(getTransferErrorMessage(error, "err_transfer_import"));
    elements.transferModalConfirmBtn.prop("disabled", true);
  } finally {
    if (requestId === transferPreviewRequestId && transferModalMode === "export") {
      elements.transferModalConfirmBtn.prop("disabled", !loaded);
    }
  }
}

function downloadTransferBundle() {
  const selection = buildExportSelectionPayload();
  return fetchJSON("/api/transfer/export/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selection,
    }),
  }).then((response) => {
    const bundle = response?.bundle || {};
    const payload = `${JSON.stringify(bundle, null, 2)}\n`;
    const blob = new Blob([payload], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "openclaw-skill-export.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }).then(() => {
    showToast(t("ok_transfer_export_started"), "success");
  });
}

async function handleTransferImportFile(file) {
  if (!file) {
    return;
  }

  setBusy(elements.importBundleBtn, true);
  try {
    const fileContents = await readFile(file);
    const bundle = JSON.parse(fileContents);
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
      throw new Error(t("err_transfer_invalid_bundle"));
    }

    const preview = await fetchJSON("/api/transfer/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle,
        apply_environment: false,
        overwrite_workflows: true,
      }),
    });

    renderImportPreviewModal(preview);
    const confirmation = await openTransferModal({
      title: t("import_bundle_preview_title"),
      confirmLabel: t("import_bundle_confirm"),
      mode: "import",
      payloadBuilder: (confirmed) => ({
        confirmed,
        checked: elements.transferImportApplyEnvironment.prop("checked"),
      }),
    });
    if (!confirmation.confirmed) {
      return;
    }

    const report = await fetchJSON("/api/transfer/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle,
        apply_environment: confirmation.checked,
        overwrite_workflows: true,
      }),
    });

    await loadServers();
    await loadWorkflows();
    refreshServerSelector();
    refreshWorkflowPanel();
    showToast(t("ok_transfer_import", {
      servers: report?.plan?.summary?.created_servers || 0,
      created: report?.plan?.summary?.created_workflows || 0,
      overwritten: report?.plan?.summary?.overwritten_workflows || 0,
    }), "success", 4200);
  } catch (error) {
    const fallbackKey = error?.message === t("err_transfer_invalid_bundle")
      ? "err_transfer_invalid_bundle"
      : error?.detail?.errors || error?.detail?.validation?.errors
        ? "err_transfer_preview"
        : "err_transfer_import";
    showToast(getTransferErrorMessage(error, fallbackKey), "error", 4800);
  } finally {
    elements.transferImportFile.val("");
    setBusy(elements.importBundleBtn, false);
  }
}

async function loadWorkflowForEditing(serverId, workflowId, $button) {
  if ($button?.length) {
    $button.prop("disabled", true);
  }

  try {
    const data = await getWorkflowDetail(serverId, workflowId);
    currentUpgradeSummary = null;
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
    let newSchema = { ...parsed.schemaParams };
    const suggestedWorkflowId = suggestWorkflowId(parsed.workflowData, file.name);
    const currentWorkflowId = elements.workflowId.val().trim();
    const shouldAutofillWorkflowId = !getState().editingWorkflowId
      && (!currentWorkflowId || currentWorkflowId === lastAutoWorkflowId);

    if (getState().editingWorkflowId) {
      const migration = migrateSchemaParams(getState().schemaParams, parsed.schemaParams);
      newSchema = migration.schemaParams;
      currentUpgradeSummary = migration.summary;
      renderUpgradeSummaryBanner();
      showToast(t("workflow_upgrade_summary", migration.summary), "success", 4200);
    } else {
      currentUpgradeSummary = null;
      renderUpgradeSummaryBanner();
    }

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
  elements.exportBundleBtn.text(t("export_bundle"));
  elements.importBundleBtn.text(t("import_bundle"));
  refreshTransferModalLanguage();
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
    closeWorkflowMoreMenus();
    if (!elements.transferModalOverlay.hasClass("hidden")) {
      closeTransferModal(false);
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

  elements.workflowSearch.on("input", function () {
    workflowListFilters.query = $(this).val().trim();
    refreshWorkflowPanel();
  });

  elements.workflowSort.on("change", function () {
    workflowListFilters.sort = $(this).val();
    refreshWorkflowPanel();
  });

  elements.editorBackBtn.on("click", async () => {
    await exitEditor();
  });

  elements.workflowList.on("click", "button[data-action='delete-workflow']", function () {
    closeWorkflowMoreMenus();
    const $button = $(this);
    const $item = $button.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    deleteWorkflow(serverId, workflowId, $button);
  });

  elements.workflowList.on("click", "button[data-action='edit-workflow']", function () {
    closeWorkflowMoreMenus();
    const $button = $(this);
    const $item = $button.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    loadWorkflowForEditing(serverId, workflowId, $button);
  });

  elements.workflowList.on("click", "button[data-action='toggle-workflow-menu']", function (event) {
    event.stopPropagation();
    const $more = $(this).closest(".workflow-more");
    const isOpen = $more.hasClass("is-open");
    closeWorkflowMoreMenus();
    if (!isOpen) {
      $more.addClass("is-open");
      $more.find(".workflow-more-menu").removeClass("hidden");
      $(this).attr("aria-expanded", "true");
    }
  });

  elements.workflowList.on("click", "button[data-action='upload-workflow-version']", async function () {
    closeWorkflowMoreMenus();
    if (!(await confirmLeaveEditorIfDirty())) {
      return;
    }

    const $item = $(this).closest("[data-workflow-id]");
    const workflowId = String($item.data("workflowId"));
    const serverId = String($item.data("serverId"));

    try {
      const target = await getWorkflowDetail(serverId, workflowId);
      openWorkflowVersionPicker(target);
    } catch (error) {
      showToast(error.message || t("err_load_saved_wf"), "error");
    }
  });

  elements.workflowList.on("change", "input[data-action='toggle-workflow']", function () {
    closeWorkflowMoreMenus();
    const $checkbox = $(this);
    const $item = $checkbox.closest("[data-workflow-id]");
    const workflowId = $item.data("workflowId");
    const serverId = $item.data("serverId");
    toggleWorkflowStatus(serverId, workflowId, $checkbox);
  });

  $(document).on("click", (event) => {
    if ($(event.target).closest(".workflow-more").length) {
      return;
    }
    closeWorkflowMoreMenus();
  });

  elements.workflowList.on("dragstart", ".workflow-drag-handle[draggable='true']", function (event) {
    if (!canDragReorderWorkflows()) {
      event.preventDefault();
      return;
    }

    const $item = $(this).closest(".workflow-item");
    draggedWorkflowId = String($item.data("workflowId"));
    $item.addClass("is-dragging");
    event.originalEvent?.dataTransfer?.setData("text/plain", draggedWorkflowId);
    if (event.originalEvent?.dataTransfer) {
      event.originalEvent.dataTransfer.effectAllowed = "move";
    }
  });

  elements.workflowList.on("dragover", ".workflow-item", function (event) {
    if (!canDragReorderWorkflows() || !draggedWorkflowId) {
      return;
    }

    event.preventDefault();
    const $item = $(this);
    $(".workflow-item").removeClass("is-drop-target");
    $item.addClass("is-drop-target");
  });

  elements.workflowList.on("dragleave", ".workflow-item", function () {
    $(this).removeClass("is-drop-target");
  });

  elements.workflowList.on("dragend", ".workflow-drag-handle[draggable='true']", function () {
    draggedWorkflowId = null;
    $(".workflow-item").removeClass("is-dragging is-drop-target");
  });

  elements.workflowList.on("drop", ".workflow-item", async function (event) {
    if (!canDragReorderWorkflows() || !draggedWorkflowId) {
      return;
    }

    event.preventDefault();
    const $target = $(this);
    const targetWorkflowId = String($target.data("workflowId"));

    if (!targetWorkflowId || targetWorkflowId === draggedWorkflowId) {
      $(".workflow-item").removeClass("is-dragging is-drop-target");
      draggedWorkflowId = null;
      return;
    }

    const rect = this.getBoundingClientRect();
    const pointerY = event.originalEvent?.clientY ?? rect.top;
    const placeAfter = pointerY > rect.top + rect.height / 2;
    const reorderedWorkflows = reorderCurrentServerWorkflows(draggedWorkflowId, targetWorkflowId, placeAfter);

    $(".workflow-item").removeClass("is-dragging is-drop-target");

    if (!reorderedWorkflows) {
      draggedWorkflowId = null;
      return;
    }

    const currentServerId = getCurrentServerId();
    const orderedIds = reorderedWorkflows
      .filter((workflow) => workflow.server_id === currentServerId)
      .map((workflow) => workflow.id);

    const previousWorkflows = [...getState().workflows];
    setWorkflows(reorderedWorkflows);
    refreshWorkflowPanel();
    draggedWorkflowId = null;

    try {
      await persistWorkflowOrder(currentServerId, orderedIds);
    } catch {
      setWorkflows(previousWorkflows);
      refreshWorkflowPanel();
      showToast(t("err_reorder_workflows"), "error");
    }
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

  elements.workflowVersionUpload.on("change", async function () {
    const file = this.files?.[0];
    const target = pendingWorkflowVersionTarget;
    pendingWorkflowVersionTarget = null;
    elements.workflowVersionUpload.val("");

    if (!file || !target) {
      return;
    }

    try {
      await applyWorkflowUpgrade(target, file);
    } catch (error) {
      const uploadError = getUploadErrorMessage(error);
      showToast(uploadError.message, "error", uploadError.duration);
    }
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

function bindTransferEvents() {
  elements.exportBundleBtn.on("click", async () => {
    const resultPromise = openTransferModal({
      title: t("export_bundle_title"),
      confirmLabel: t("export_bundle_confirm"),
      mode: "export",
      payloadBuilder: (confirmed) => ({ confirmed }),
    });
    await refreshExportPreview();
    const result = await resultPromise;
    if (!result.confirmed) {
      return;
    }
    setBusy(elements.transferModalConfirmBtn, true);
    try {
      await downloadTransferBundle();
    } catch (error) {
      showToast(getTransferErrorMessage(error, "err_transfer_import"), "error", 4800);
    } finally {
      setBusy(elements.transferModalConfirmBtn, false);
    }
  });

  elements.importBundleBtn.on("click", async () => {
    if (isEditorVisible() && !(await exitEditor())) {
      return;
    }
    elements.transferImportFile.val("");
    elements.transferImportFile.trigger("click");
  });

  elements.transferImportFile.on("change", async function () {
    await handleTransferImportFile(this.files?.[0]);
  });

  elements.transferModalCancelBtn.on("click", () => closeTransferModal(false));
  elements.transferModalConfirmBtn.on("click", () => closeTransferModal(true));
  elements.transferModalOverlay.on("click", (event) => {
    if (event.target === elements.transferModalOverlay[0]) {
      closeTransferModal(false);
    }
  });

  elements.transferExportTree.on("change", "[data-export-server-checkbox]", function () {
    const $checkbox = $(this);
    const serverId = String($checkbox.data("serverId") || "");
    const checked = $checkbox.prop("checked");
    elements.transferExportTree
      .find(`[data-export-workflow-checkbox][data-server-id="${serverId}"]`)
      .prop("checked", checked);
    $checkbox.prop("indeterminate", false);
    updateExportSummaryFromSelection();
  });

  elements.transferExportTree.on("change", "[data-export-workflow-checkbox]", function () {
    const serverId = String($(this).data("serverId") || "");
    syncExportServerCheckboxState(serverId);
    updateExportSummaryFromSelection();
  });

  elements.transferExportTree.on("click", "[data-export-toggle]", function () {
    const serverId = String($(this).data("exportToggle") || "");
    const isOpen = elements.transferExportTree.find(`[data-export-server="${serverId}"]`).hasClass("is-open");
    setExportAccordionOpen(serverId, !isOpen);
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
    elements.exportBundleBtn.text(t("export_bundle"));
    elements.importBundleBtn.text(t("import_bundle"));
    refreshTransferModalLanguage();
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
  bindTransferEvents();

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
  elements.workflowSearch.val(workflowListFilters.query);
  elements.workflowSort.val(workflowListFilters.sort);
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
