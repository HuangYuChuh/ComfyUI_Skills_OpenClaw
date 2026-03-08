import { t } from "./i18n.js";
import { getState } from "./state.js";
import { escapeHtml } from "./ui-utils.js";

export function renderWorkflowSummary($container) {
  const { workflows } = getState();
  $container.text(workflows.length ? t("workflow_count", { count: workflows.length }) : "");
}

export function renderWorkflowLoading($container) {
  $container.html(`<div class="empty-state">${escapeHtml(t("loading"))}</div>`);
}

export function renderWorkflowList($container) {
  const { workflows } = getState();

  if (!workflows.length) {
    $container.html(`<div class="empty-state">${escapeHtml(t("no_workflows"))}</div>`);
    return;
  }

  $container.html(
    workflows
      .map((workflow) => {
        const enabledClass = workflow.enabled ? "" : " is-disabled";
        const stateText = workflow.enabled ? t("wf_enabled") : t("wf_disabled");
        return `
          <article class="workflow-item" data-workflow-id="${escapeHtml(workflow.id)}">
            <div class="workflow-main">
              <div class="workflow-name-row">
                <span class="status-dot${enabledClass}" aria-hidden="true">●</span>
                <span class="workflow-name">${escapeHtml(workflow.id)}</span>
              </div>
              <p class="workflow-status">${escapeHtml(stateText)}</p>
            </div>
            <div class="workflow-actions">
              <button type="button" class="btn btn-secondary btn-icon" data-action="edit-workflow" aria-label="${escapeHtml(t("edit_workflow", { id: workflow.id }))}">✎</button>
              <label class="toggle-switch" aria-label="${escapeHtml(t("toggle_workflow", { id: workflow.id }))}">
                <input type="checkbox" data-action="toggle-workflow" ${workflow.enabled ? "checked" : ""}>
                <span class="slider"></span>
              </label>
              <button type="button" class="btn-danger btn-icon" data-action="delete-workflow" aria-label="${escapeHtml(t("delete_workflow", { id: workflow.id }))}">✕</button>
            </div>
          </article>
        `;
      })
      .join(""),
  );
}
