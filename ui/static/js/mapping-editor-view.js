import { t } from "./i18n.js";
import { getState } from "./state.js";
import { groupSchemaParams } from "./workflow-mapper.js";
import { escapeHtml } from "./ui-utils.js";

function renderTypeOptions(parameter) {
  const options = [
    ["string", t("type_str")],
    ["int", t("type_int")],
    ["float", t("type_float")],
    ["boolean", t("type_bool")],
  ];

  return options
    .map(
      ([value, label]) =>
        `<option value="${value}" ${parameter.type === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join("");
}

function renderParamConfig(parameter) {
  if (!parameter.exposed) {
    return "";
  }

  return `
    <div class="param-config">
      <div>
        <label for="alias-${escapeHtml(parameter.key)}">${escapeHtml(t("alias"))}</label>
        <input id="alias-${escapeHtml(parameter.key)}" type="text" data-param-key="${escapeHtml(parameter.key)}" data-field="name" value="${escapeHtml(parameter.name)}">
      </div>
      <div>
        <label for="desc-${escapeHtml(parameter.key)}">${escapeHtml(t("ai_desc"))}</label>
        <input id="desc-${escapeHtml(parameter.key)}" type="text" data-param-key="${escapeHtml(parameter.key)}" data-field="description" value="${escapeHtml(parameter.description)}" placeholder="${escapeHtml(t("ai_desc_placeholder"))}">
      </div>
      <div>
        <label for="type-${escapeHtml(parameter.key)}">${escapeHtml(t("type"))}</label>
        <select id="type-${escapeHtml(parameter.key)}" data-param-key="${escapeHtml(parameter.key)}" data-field="type">
          ${renderTypeOptions(parameter)}
        </select>
        <label class="checkbox-inline" for="required-${escapeHtml(parameter.key)}">
          <input id="required-${escapeHtml(parameter.key)}" type="checkbox" data-param-key="${escapeHtml(parameter.key)}" data-field="required" ${parameter.required ? "checked" : ""}>
          <span>${escapeHtml(t("required"))}</span>
        </label>
      </div>
    </div>
  `;
}

function renderParamRow(parameter) {
  const rowClass = parameter.exposed ? "param-row active" : "param-row";
  const titleClass = parameter.exposed ? "param-title active" : "param-title";

  return `
    <div class="${rowClass}">
      <div class="param-main">
        <label class="toggle-switch" aria-label="${escapeHtml(parameter.field)}">
          <input type="checkbox" data-param-key="${escapeHtml(parameter.key)}" data-field="exposed" ${parameter.exposed ? "checked" : ""}>
          <span class="slider"></span>
        </label>
        <div class="param-main-copy">
          <div class="${titleClass}">${escapeHtml(parameter.field)}</div>
          <div class="param-meta">${escapeHtml(t("curr_val"))}: ${escapeHtml(parameter.currentVal)}</div>
        </div>
      </div>
      ${renderParamConfig(parameter)}
    </div>
  `;
}

function renderNodeCard([nodeId, nodeData]) {
  const paramsHtml = nodeData.params.map((parameter) => renderParamRow({ key: parameter.key, ...parameter })).join("");

  return `
    <article class="node-card">
      <div class="node-header">
        <div class="node-title">
          <span class="status-dot" aria-hidden="true">●</span>
          <span>${escapeHtml(nodeData.classType)}</span>
        </div>
        <span class="status-badge">${escapeHtml(t("node_id"))}: ${escapeHtml(nodeId)}</span>
      </div>
      <div class="node-body">${paramsHtml}</div>
    </article>
  `;
}

export function renderEditorMode($badge, $saveButton) {
  const { editingWorkflowId } = getState();
  if (editingWorkflowId) {
    $badge.text(`${t("editor_mode_editing")}: ${editingWorkflowId}`);
    $saveButton.text(t("save_workflow_edit"));
    return;
  }

  $badge.text(t("editor_mode_create"));
  $saveButton.text(t("save_workflow"));
}

export function renderEmptyNodes($container) {
  $container.html(`<div class="empty-state">${escapeHtml(t("empty_nodes"))}</div>`);
}

export function renderNodes($container) {
  const groupedNodes = groupSchemaParams(getState().schemaParams);

  if (!groupedNodes.length) {
    renderEmptyNodes($container);
    return;
  }

  $container.html(groupedNodes.map(renderNodeCard).join(""));
}

export function setEditorVisibility({ mappingSection, uploadZone }, isVisible) {
  mappingSection.toggleClass("hidden", !isVisible);
  uploadZone.toggleClass("hidden", isVisible);
}
