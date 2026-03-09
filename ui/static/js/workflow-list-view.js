import { t } from "./i18n.js";
import { getState, getCurrentServerId } from "./state.js";
import { escapeHtml } from "./ui-utils.js";

export function renderWorkflowSummary($container, visibleWorkflows = null) {
  const { workflows } = getState();
  const serverId = getCurrentServerId();
  const serverWorkflows = workflows.filter((wf) => wf.server_id === serverId);
  const visibleCount = Array.isArray(visibleWorkflows) ? visibleWorkflows.length : serverWorkflows.length;

  if (!serverWorkflows.length) {
    $container.text("");
    return;
  }

  $container.text(
    visibleCount === serverWorkflows.length
      ? t("workflow_count", { count: serverWorkflows.length })
      : t("workflow_count_filtered", { visible: visibleCount, total: serverWorkflows.length }),
  );
}

export function renderWorkflowLoading($container) {
  $container.html(`<div class="empty-state">${escapeHtml(t("loading"))}</div>`);
}

export function renderWorkflowList($container, serverWorkflows = [], options = {}) {
  const {
    isCustomOrder = false,
    dragEnabled = false,
    hasAnyWorkflows = serverWorkflows.length > 0,
  } = options;

  if (!serverWorkflows.length) {
    $container.html(
      `<div class="empty-state">${escapeHtml(t(hasAnyWorkflows ? "no_workflows_match" : "no_workflows"))}</div>`,
    );
    return;
  }

  $container.html(
    serverWorkflows
      .map((workflow) => {
        const enabledClass = workflow.enabled ? "" : " is-disabled";
        const stateText = workflow.enabled ? t("wf_enabled") : t("wf_disabled");
        const desc = workflow.description || "";
        const dragHandle = isCustomOrder
          ? `
              <button
                type="button"
                class="btn btn-secondary btn-icon workflow-drag-handle${dragEnabled ? "" : " is-disabled"}"
                data-action="drag-handle"
                draggable="${dragEnabled ? "true" : "false"}"
                aria-label="${escapeHtml(t("workflow_drag_handle", { id: workflow.id }))}"
                title="${escapeHtml(t("workflow_drag_handle", { id: workflow.id }))}"
                tabindex="-1"
              >
                <span aria-hidden="true">&#x2261;</span>
              </button>
            `
          : "";
        return `
          <article
            class="workflow-item${dragEnabled ? " is-reorderable" : ""}"
            data-workflow-id="${escapeHtml(workflow.id)}"
            data-server-id="${escapeHtml(workflow.server_id)}"
          >
            <div class="workflow-main">
              <div class="workflow-name-row">
                <span class="status-dot${enabledClass}" aria-hidden="true">&#x25CF;</span>
                <span class="workflow-name">${escapeHtml(workflow.id)}</span>
                <span class="workflow-server-tag">${escapeHtml(workflow.server_name || workflow.server_id)}</span>
              </div>
              ${desc ? `<p class="workflow-desc">${escapeHtml(desc)}</p>` : ""}
            </div>
            <div class="workflow-actions">
              ${dragHandle}
              <div class="workflow-status-toggle">
                <label class="toggle-inline" aria-label="${escapeHtml(t("toggle_workflow", { id: workflow.id }))}">
                  <span class="workflow-enabled-label${workflow.enabled ? " status-on" : " status-off"}">${escapeHtml(stateText)}</span>
                  <div class="toggle-switch">
                    <input type="checkbox" data-action="toggle-workflow" ${workflow.enabled ? "checked" : ""}>
                    <span class="slider"></span>
                  </div>
                </label>
              </div>
              <button type="button" class="btn btn-secondary btn-icon workflow-action-btn workflow-action-edit" data-action="edit-workflow" aria-label="${escapeHtml(t("edit_workflow", { id: workflow.id }))}">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="icon icon-tabler icons-tabler-outline icon-tabler-edit">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
                  <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" />
                  <path d="M16 5l3 3" />
                </svg>
              </button>
              <div class="workflow-more">
                <button
                  type="button"
                  class="btn btn-secondary btn-icon workflow-action-btn workflow-more-trigger"
                  data-action="toggle-workflow-menu"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-label="${escapeHtml(t("workflow_more_actions", { id: workflow.id }))}"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="icon icon-tabler icons-tabler-outline icon-tabler-dots-vertical">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                    <path d="M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                    <path d="M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                  </svg>
                </button>
                <div class="workflow-more-menu hidden" role="menu">
                  <button type="button" class="workflow-more-item" data-action="upload-workflow-version" role="menuitem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                      class="icon icon-tabler icons-tabler-outline icon-tabler-upload">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                      <path d="M7 9l5 -5l5 5" />
                      <path d="M12 4l0 12" />
                    </svg>
                    <span>${escapeHtml(t("upload_new_version"))}</span>
                  </button>
                  <button type="button" class="workflow-more-item workflow-more-item-danger" data-action="delete-workflow" role="menuitem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                      class="icon icon-tabler icons-tabler-outline icon-tabler-trash">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M4 7l16 0" />
                      <path d="M10 11l0 6" />
                      <path d="M14 11l0 6" />
                      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                    <span>${escapeHtml(t("delete"))}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join(""),
  );
}
