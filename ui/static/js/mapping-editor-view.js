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

function renderParamConfig(parameter, isConfigExpanded) {
  if (!parameter.exposed) {
    return "";
  }

  return `
    <div class="param-config${isConfigExpanded ? " is-expanded" : ""}">
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

function renderParamRow(parameter, expandedParamKeys = new Set()) {
  const rowClass = parameter.exposed ? "param-row active" : "param-row";
  const titleClass = parameter.exposed ? "param-title active" : "param-title";
  const isConfigExpanded = parameter.exposed && expandedParamKeys.has(parameter.key);
  const migrationStatus = String(parameter.migrationStatus || "");
  const migrationBadge = migrationStatus
    ? `
        <span class="param-status-badge is-${escapeHtml(migrationStatus)}">
          ${escapeHtml(t(`migration_status_${migrationStatus}`))}
        </span>
      `
    : "";
  const migrationHint = migrationStatus === "review"
    ? `<div class="param-meta param-meta-emphasis">${escapeHtml(t("migration_review_hint"))}</div>`
    : "";
  const configToggle = parameter.exposed
    ? `
        <button type="button" class="btn btn-secondary btn-icon small param-config-toggle"
          data-action="toggle-param-config" data-param-key="${escapeHtml(parameter.key)}"
          aria-label="${escapeHtml(t("toggle_param_config", { field: parameter.field }))}">
          ${isConfigExpanded ? "▾" : "▸"}
        </button>
      `
    : "";

  return `
    <div class="${rowClass}">
      <div class="param-main">
        <label class="toggle-switch" aria-label="${escapeHtml(parameter.field)}">
          <input type="checkbox" data-param-key="${escapeHtml(parameter.key)}" data-field="exposed" ${parameter.exposed ? "checked" : ""}>
          <span class="slider"></span>
        </label>
        <div class="param-main-copy">
          <div class="${titleClass}">
            <span>${escapeHtml(parameter.field)}</span>
            ${migrationBadge}
          </div>
          <div class="param-meta">${escapeHtml(t("curr_val"))}: ${escapeHtml(parameter.currentVal)}</div>
          ${migrationHint}
        </div>
        ${configToggle}
      </div>
      ${renderParamConfig(parameter, isConfigExpanded)}
    </div>
  `;
}

function renderNodeCard([nodeId, nodeData], collapsedNodeIds = new Set(), expandedParamKeys = new Set()) {
  const isCollapsed = collapsedNodeIds.has(String(nodeId));
  const paramsHtml = nodeData.params
    .map((parameter) => renderParamRow({ key: parameter.key, ...parameter }, expandedParamKeys))
    .join("");

  return `
    <article class="node-card${isCollapsed ? " is-collapsed" : ""}">
      <div class="node-header">
        <div class="node-title">
          <span class="status-dot" aria-hidden="true">●</span>
          <span>${escapeHtml(nodeData.classType)}</span>
        </div>
        <div class="node-header-right">
          <span class="status-badge">${escapeHtml(t("node_id"))}: ${escapeHtml(nodeId)}</span>
          <button type="button" class="btn btn-secondary btn-icon small node-collapse-btn"
            data-action="toggle-node" data-node-id="${escapeHtml(nodeId)}"
            aria-label="${escapeHtml(t("toggle_node", { id: nodeId }))}">
            ${isCollapsed ? "▸" : "▾"}
          </button>
        </div>
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

export function renderEmptyNodes($container, messageKey = "empty_nodes") {
  $container.html(`<div class="empty-state">${escapeHtml(t(messageKey))}</div>`);
}

function matchQuery(parameter, classType, nodeId, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    classType,
    String(nodeId),
    parameter.field,
    parameter.name,
    parameter.description,
    String(parameter.currentVal),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function compareStrings(first, second) {
  return String(first).localeCompare(String(second), "en", { sensitivity: "base" });
}

function sortNodeEntries(nodeEntries, nodeSort) {
  const sorted = [...nodeEntries];
  if (nodeSort === "node_id_desc") {
    sorted.sort((first, second) => Number(second[0]) - Number(first[0]));
  } else if (nodeSort === "class_asc") {
    sorted.sort((first, second) => compareStrings(first[1].classType, second[1].classType));
  } else {
    sorted.sort((first, second) => Number(first[0]) - Number(second[0]));
  }
  return sorted;
}

function sortParams(params, paramSort) {
  const sorted = [...params];
  if (paramSort === "field_asc") {
    sorted.sort((first, second) => compareStrings(first.field, second.field));
  } else if (paramSort === "type_asc") {
    sorted.sort((first, second) => compareStrings(first.type, second.type));
  } else if (paramSort === "exposed_first") {
    sorted.sort((first, second) => {
      if (first.exposed !== second.exposed) {
        return first.exposed ? -1 : 1;
      }
      return compareStrings(first.field, second.field);
    });
  }
  return sorted;
}

export function renderNodes($container, options = {}) {
  const { schemaParams } = getState();
  const groupedNodes = groupSchemaParams(schemaParams);
  const query = String(options.query || "").trim().toLowerCase();
  const exposedOnly = Boolean(options.exposedOnly);
  const requiredOnly = Boolean(options.requiredOnly);
  const nodeSort = options.nodeSort || "node_id_asc";
  const paramSort = options.paramSort || "default";
  const collapsedNodeIds = options.collapsedNodeIds instanceof Set ? options.collapsedNodeIds : new Set();
  const expandedParamKeys = options.expandedParamKeys instanceof Set ? options.expandedParamKeys : new Set();

  const allParams = Object.values(schemaParams);
  const totalParams = allParams.length;
  const totalExposed = allParams.filter((parameter) => parameter.exposed).length;

  if (!groupedNodes.length) {
    renderEmptyNodes($container);
    return {
      totalParams,
      totalExposed,
      visibleParams: 0,
      visibleNodes: 0,
    };
  }

  const filteredNodes = sortNodeEntries(groupedNodes, nodeSort)
    .map(([nodeId, nodeData]) => {
      const params = sortParams(nodeData.params, paramSort).filter((parameter) => {
        if (exposedOnly && !parameter.exposed) {
          return false;
        }
        if (requiredOnly && !parameter.required) {
          return false;
        }
        return matchQuery(parameter, nodeData.classType, nodeId, query);
      });
      return [nodeId, { ...nodeData, params }];
    })
    .filter(([, nodeData]) => nodeData.params.length > 0);

  if (!filteredNodes.length) {
    renderEmptyNodes($container, "empty_nodes_filtered");
    return {
      totalParams,
      totalExposed,
      visibleParams: 0,
      visibleNodes: 0,
      visibleParamKeys: [],
      visibleNodeIds: [],
    };
  }

  $container.html(filteredNodes.map((entry) => renderNodeCard(entry, collapsedNodeIds, expandedParamKeys)).join(""));
  const visibleParams = filteredNodes.reduce((sum, [, nodeData]) => sum + nodeData.params.length, 0);
  const visibleParamKeys = filteredNodes.flatMap(([, nodeData]) => nodeData.params.map((param) => param.key));
  const visibleExposedParamKeys = filteredNodes.flatMap(([, nodeData]) =>
    nodeData.params.filter((param) => param.exposed).map((param) => param.key),
  );
  const visibleNodeIds = filteredNodes.map(([nodeId]) => String(nodeId));

  return {
    totalParams,
    totalExposed,
    visibleParams,
    visibleNodes: filteredNodes.length,
    visibleParamKeys,
    visibleExposedParamKeys,
    visibleNodeIds,
  };
}

export function setEditorVisibility({ mappingSection, uploadZone }, isVisible) {
  mappingSection.toggleClass("hidden", !isVisible);
  uploadZone.toggleClass("hidden", isVisible);
}
