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
              <p class="workflow-desc">${desc ? escapeHtml(desc) : `<em>${escapeHtml(stateText)}</em>`}</p>
            </div>
            <div class="workflow-actions">
              <button type="button" class="btn btn-secondary btn-icon" data-action="edit-workflow" aria-label="${escapeHtml(t("edit_workflow", { id: workflow.id }))}">&#x270E;</button>
              <label class="toggle-switch" aria-label="${escapeHtml(t("toggle_workflow", { id: workflow.id }))}">
                <input type="checkbox" data-action="toggle-workflow" ${workflow.enabled ? "checked" : ""}>
                <span class="slider"></span>
              </label>
              <button type="button" class="btn-danger btn-icon" data-action="delete-workflow" aria-label="${escapeHtml(t("delete_workflow", { id: workflow.id }))}">&#x2715;</button>
            </div>
          </article>
        `;
      })
      .join(""),
  );
}
