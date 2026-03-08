import { t } from "./i18n.js";
import { getState, getCurrentServerId } from "./state.js";
import { escapeHtml } from "./ui-utils.js";

export function renderWorkflowSummary($container) {
  const { workflows } = getState();
  const serverId = getCurrentServerId();
  const serverWorkflows = workflows.filter((wf) => wf.server_id === serverId);
  $container.text(serverWorkflows.length ? t("workflow_count", { count: serverWorkflows.length }) : "");
}

export function renderWorkflowLoading($container) {
  $container.html(`<div class="empty-state">${escapeHtml(t("loading"))}</div>`);
}

export function renderWorkflowList($container) {
  const { workflows } = getState();
  const serverId = getCurrentServerId();
  const serverWorkflows = workflows.filter((wf) => wf.server_id === serverId);

  if (!serverWorkflows.length) {
    $container.html(`<div class="empty-state">${escapeHtml(t("no_workflows"))}</div>`);
    return;
  }

  $container.html(
    serverWorkflows
      .map((workflow) => {
        const enabledClass = workflow.enabled ? "" : " is-disabled";
        const stateText = workflow.enabled ? t("wf_enabled") : t("wf_disabled");
        const desc = workflow.description || "";
        return `
          <article class="workflow-item" data-workflow-id="${escapeHtml(workflow.id)}" data-server-id="${escapeHtml(workflow.server_id)}">
            <div class="workflow-main">
              <div class="workflow-name-row">
                <span class="status-dot${enabledClass}" aria-hidden="true">&#x25CF;</span>
                <span class="workflow-name">${escapeHtml(workflow.id)}</span>
                <span class="workflow-server-tag">${escapeHtml(workflow.server_name || workflow.server_id)}</span>
              </div>
              ${desc ? `<p class="workflow-desc">${escapeHtml(desc)}</p>` : ""}
            </div>
            <div class="workflow-actions">
              <div class="workflow-status-toggle">
                <label class="toggle-inline" aria-label="${escapeHtml(t("toggle_workflow", { id: workflow.id }))}">
                  <span class="workflow-enabled-label${workflow.enabled ? " status-on" : " status-off"}">${escapeHtml(stateText)}</span>
                  <div class="toggle-switch">
                    <input type="checkbox" data-action="toggle-workflow" ${workflow.enabled ? "checked" : ""}>
                    <span class="slider"></span>
                  </div>
                </label>
              </div>
              <button type="button" class="btn btn-secondary btn-icon workflow-action-btn" data-action="edit-workflow" aria-label="${escapeHtml(t("edit_workflow", { id: workflow.id }))}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="lucide lucide-pencil">
                  <path
                    d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
              <button type="button" class="btn btn-secondary btn-icon workflow-action-btn workflow-delete-btn" data-action="delete-workflow" aria-label="${escapeHtml(t("delete_workflow", { id: workflow.id }))}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </article>
        `;
      })
      .join(""),
  );
}
