import { useState, type ChangeEvent, type RefObject } from "react";
import { CustomSelect } from "../../components/ui/CustomSelect";
import type { SchemaParam, SchemaParamMap, UpgradeSummary } from "../../types/editor";

function renderTypeOptions(t: (key: string) => string) {
  return [
    { value: "string", label: t("type_str") },
    { value: "int", label: t("type_int") },
    { value: "float", label: t("type_float") },
    { value: "boolean", label: t("type_bool") },
  ];
}

interface MappingNodeProps {
  nodeId: string;
  classType: string;
  params: Array<SchemaParam & { key: string }>;
  collapsed: boolean;
  expandedParamKeys: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onToggleParamConfig: (key: string) => void;
  onUpdateParam: (key: string, field: keyof SchemaParam | "name" | "exposed" | "description" | "required" | "type", value: unknown) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function MappingNode(props: MappingNodeProps) {
  return (
    <article className={`node-card${props.collapsed ? " is-collapsed" : ""}`}>
      <div className="node-header">
        <div className="node-title">
          <span className="status-dot" aria-hidden="true">●</span>
          <span>{props.classType}</span>
        </div>
        <div className="node-header-right">
          <span className="status-badge">{props.t("node_id")}: {props.nodeId}</span>
          <button
            type="button"
            className="btn btn-secondary btn-icon small node-collapse-btn"
            aria-label={props.t("toggle_node", { id: props.nodeId })}
            onClick={() => props.onToggleNode(props.nodeId)}
          >
            {props.collapsed ? "▸" : "▾"}
          </button>
        </div>
      </div>

      {!props.collapsed ? (
        <div className="node-body">
          {props.params.map((parameter) => {
            const expanded = parameter.exposed && props.expandedParamKeys.has(parameter.key);
            return (
              <div key={parameter.key} className={`param-row${parameter.exposed ? " active" : ""}`}>
                <div className="param-main">
                  <label className="toggle-switch" aria-label={parameter.field}>
                    <input
                      type="checkbox"
                      checked={parameter.exposed}
                      onChange={(event) => props.onUpdateParam(parameter.key, "exposed", event.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                  <div className="param-main-copy">
                    <div className={`param-title${parameter.exposed ? " active" : ""}`}>
                      <span>{parameter.field}</span>
                      {parameter.migrationStatus ? (
                        <span className={`param-status-badge is-${parameter.migrationStatus}`}>
                          {props.t(`migration_status_${parameter.migrationStatus}`)}
                        </span>
                      ) : null}
                    </div>
                    <div className="param-meta">{props.t("curr_val")}: {String(parameter.currentVal ?? "")}</div>
                    {parameter.migrationStatus === "review" ? (
                      <div className="param-meta param-meta-emphasis">{props.t("migration_review_hint")}</div>
                    ) : null}
                  </div>
                  {parameter.exposed ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon small param-config-toggle"
                      aria-label={props.t("toggle_param_config", { field: parameter.field })}
                      onClick={() => props.onToggleParamConfig(parameter.key)}
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                  ) : null}
                </div>

                {parameter.exposed && expanded ? (
                  <div className="param-config is-expanded">
                    <div>
                      <label>{props.t("alias")}</label>
                      <input
                        value={parameter.name}
                        onChange={(event) => props.onUpdateParam(parameter.key, "name", event.target.value)}
                      />
                    </div>
                    <div>
                      <label>{props.t("ai_desc")}</label>
                      <input
                        value={parameter.description}
                        onChange={(event) => props.onUpdateParam(parameter.key, "description", event.target.value)}
                      />
                    </div>
                    <div>
                      <label>{props.t("type")}</label>
                      <CustomSelect
                        value={parameter.type}
                        options={renderTypeOptions(props.t)}
                        onChange={(value) => props.onUpdateParam(parameter.key, "type", value)}
                        ariaLabel={props.t("type")}
                        className="is-mapping-sort-select"
                      />
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={parameter.required}
                          onChange={(event) => props.onUpdateParam(parameter.key, "required", event.target.checked)}
                        />
                        <span>{props.t("required")}</span>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

interface EditorViewProps {
  workflowId: string;
  description: string;
  schemaParams: SchemaParamMap;
  hasWorkflow: boolean;
  emptyStateMessageKey: string;
  mode: "create" | "edit";
  editingWorkflowId?: string | null;
  upgradeSummary: UpgradeSummary | null;
  filters: {
    query: string;
    exposedOnly: boolean;
    requiredOnly: boolean;
    nodeSort: string;
    paramSort: string;
  };
  collapsedNodeIds: Set<string>;
  expandedParamKeys: Set<string>;
  groupedNodes: Array<[string, { classType: string; params: Array<SchemaParam & { key: string }> }]>;
  summaryText: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onWorkflowIdChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onUploadFile: (file: File | null) => void;
  onSave: () => void;
  onFilterChange: (next: Partial<EditorViewProps["filters"]>) => void;
  onResetFilters: () => void;
  onToggleNode: (nodeId: string) => void;
  onToggleParamConfig: (key: string) => void;
  onUpdateParam: (key: string, field: keyof SchemaParam | "name" | "exposed" | "description" | "required" | "type", value: unknown) => void;
  onApplyRecommended: () => void;
  onExposeVisible: (exposed: boolean) => void;
  onCollapseAll: (collapsed: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function EditorView(props: EditorViewProps) {
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const editorStep = !props.workflowId ? 1 : (!props.hasWorkflow ? 2 : 3);

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    props.onUploadFile(event.target.files?.[0] || null);
    event.target.value = "";
  }

  return (
    <main className="page shell">
      <nav className="editor-nav">
        <button type="button" className="btn btn-secondary editor-back-btn" onClick={props.onBack}>
          <span aria-hidden="true">&larr;</span> <span>{props.t("back")}</span>
        </button>
        <div className="editor-nav-title">
          <p className="editor-mode-badge">
            {props.mode === "edit" ? `${props.t("editor_mode_editing")}: ${props.editingWorkflowId || props.workflowId}` : props.t("editor_mode_create")}
          </p>
          <p className="editor-progress-hint">
            {editorStep === 1
              ? props.t("editor_step_1_hint")
              : editorStep === 2
                ? props.t("editor_step_2_hint")
                : props.t("editor_step_3_hint")}
          </p>
        </div>
      </nav>

      <ol className="editor-stepper" aria-label="Workflow setup steps">
        <li className={`editor-step ${editorStep === 1 ? "is-active" : editorStep > 1 ? "is-done" : ""}`}>
          <span className="editor-step-index">1</span>
          <span className="editor-step-label">{props.t("editor_step_1")}</span>
        </li>
        <li className={`editor-step ${editorStep === 2 ? "is-active" : editorStep > 2 ? "is-done" : ""}`}>
          <span className="editor-step-index">2</span>
          <span className="editor-step-label">{props.t("editor_step_2")}</span>
        </li>
        <li className={`editor-step ${editorStep === 3 ? "is-active" : ""}`}>
          <span className="editor-step-index">3</span>
          <span className="editor-step-label">{props.t("editor_step_3")}</span>
        </li>
      </ol>

      <section className="card" aria-labelledby="editor-info-title">
        <h2 id="editor-info-title" className="card-title">{props.t("wf_basic_info")}</h2>
        <div className="editor-info-grid">
          <div className="form-group editor-info-field no-margin">
            <label htmlFor="wf-id">{props.t("wf_id_label")}</label>
            <input
              id="wf-id"
              className="input-field editor-info-input"
              value={props.workflowId}
              onChange={(event) => props.onWorkflowIdChange(event.target.value)}
              placeholder={props.t("wf_id_placeholder")}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="form-group editor-info-field no-margin">
            <label htmlFor="wf-desc">{props.t("wf_desc_label")}</label>
            <input
              id="wf-desc"
              className="input-field editor-info-input"
              value={props.description}
              onChange={(event) => props.onDescriptionChange(event.target.value)}
              placeholder={props.t("wf_desc_placeholder")}
              autoComplete="off"
            />
          </div>
        </div>

        {!props.hasWorkflow ? (
          <label
            id="upload-zone"
            className={`upload-zone${uploadDragActive ? " is-dragging" : ""}`}
            htmlFor="file-upload"
            tabIndex={0}
            onDragEnter={(event) => {
              event.preventDefault();
              setUploadDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setUploadDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setUploadDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setUploadDragActive(false);
              props.onUploadFile(event.dataTransfer.files?.[0] || null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const input = document.getElementById("file-upload");
                if (input instanceof HTMLInputElement) {
                  input.click();
                }
              }
            }}
          >
            <input id="file-upload" type="file" accept=".json" onChange={onFileInputChange} />
            <span className="upload-title">{props.t("drag_upload")}</span>
            <span className="upload-subtitle">{props.t("after_upload")}</span>
          </label>
        ) : null}

        <aside className="upload-reminder" aria-live="polite">
          <h3 className="upload-reminder-title">{props.t("upload_reminder_title")}</h3>
          <ul className="upload-reminder-list">
            <li>{props.t("upload_reminder_api")}</li>
            <li>{props.t("upload_reminder_how")}</li>
          </ul>
        </aside>
      </section>

      <section id="mapping-section" className={`card${props.hasWorkflow ? "" : " hidden"}`} aria-labelledby="mapping-title">
        <h2 id="mapping-title" className="card-title">{props.t("parsed_input")}</h2>
        {props.upgradeSummary ? (
          <div className="upgrade-summary-banner">
            <div className="upgrade-summary-title">{props.t("workflow_upgrade_ready")}</div>
            <div className="upgrade-summary-meta">
              {props.t("workflow_upgrade_summary", {
                retained: props.upgradeSummary.retained,
                review: props.upgradeSummary.review,
                added: props.upgradeSummary.added,
                removed: props.upgradeSummary.removed,
              })}
            </div>
          </div>
        ) : null}

        <div className="mapping-toolbar">
          <div className="mapping-toolbar-top">
            <input
              ref={props.searchInputRef}
              id="mapping-search"
              className="input-field"
              value={props.filters.query}
              onChange={(event) => props.onFilterChange({ query: event.target.value })}
              placeholder={props.t("mapping_search_placeholder")}
            />
            <CustomSelect
              value={props.filters.nodeSort}
              options={[
                { value: "node_id_asc", label: props.t("mapping_sort_node_id_asc") },
                { value: "node_id_desc", label: props.t("mapping_sort_node_id_desc") },
                { value: "class_asc", label: props.t("mapping_sort_class_asc") },
              ]}
              onChange={(value) => props.onFilterChange({ nodeSort: value })}
              ariaLabel={props.t("mapping_sort_node_id_asc")}
              className="is-mapping-sort-select"
            />
            <CustomSelect
              value={props.filters.paramSort}
              options={[
                { value: "default", label: props.t("mapping_sort_param_default") },
                { value: "field_asc", label: props.t("mapping_sort_param_name") },
                { value: "type_asc", label: props.t("mapping_sort_param_type") },
                { value: "exposed_first", label: props.t("mapping_sort_param_exposed") },
              ]}
              onChange={(value) => props.onFilterChange({ paramSort: value })}
              ariaLabel={props.t("mapping_sort_param_default")}
              className="is-mapping-sort-select"
            />
          </div>
          <div className="mapping-toolbar-bottom">
            <label className="checkbox-inline mapping-exposed-only-label" htmlFor="mapping-exposed-only">
              <input
                id="mapping-exposed-only"
                type="checkbox"
                checked={props.filters.exposedOnly}
                onChange={(event) => props.onFilterChange({ exposedOnly: event.target.checked })}
              />
              <span>{props.t("mapping_exposed_only")}</span>
            </label>
            <label className="checkbox-inline mapping-exposed-only-label" htmlFor="mapping-required-only">
              <input
                id="mapping-required-only"
                type="checkbox"
                checked={props.filters.requiredOnly}
                onChange={(event) => props.onFilterChange({ requiredOnly: event.target.checked })}
              />
              <span>{props.t("mapping_required_only")}</span>
            </label>
            <div className="mapping-toolbar-actions">
              <button type="button" className="btn btn-secondary" onClick={props.onApplyRecommended}>{props.t("mapping_apply_recommended")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => props.onExposeVisible(true)}>{props.t("mapping_expose_visible")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => props.onExposeVisible(false)}>{props.t("mapping_unexpose_visible")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => props.onCollapseAll(true)}>{props.t("mapping_collapse_all")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => props.onCollapseAll(false)}>{props.t("mapping_expand_all")}</button>
              <button type="button" className="btn btn-secondary" onClick={props.onResetFilters}>{props.t("mapping_reset_filters")}</button>
            </div>
          </div>
        </div>

        <p id="mapping-summary" className="section-meta">{props.summaryText}</p>
        <div id="nodes-container" className="nodes-container" aria-live="polite">
          {props.groupedNodes.length === 0 ? (
            <div className="empty-state">{props.t(props.emptyStateMessageKey)}</div>
          ) : props.groupedNodes.map(([nodeId, nodeData]) => (
            <MappingNode
              key={nodeId}
              nodeId={nodeId}
              classType={nodeData.classType}
              params={nodeData.params}
              collapsed={props.collapsedNodeIds.has(nodeId)}
              expandedParamKeys={props.expandedParamKeys}
              onToggleNode={props.onToggleNode}
              onToggleParamConfig={props.onToggleParamConfig}
              onUpdateParam={props.onUpdateParam}
              t={props.t}
            />
          ))}
        </div>
        <div className="mapping-savebar">
          <p className="mapping-shortcut-hint">{props.t("mapping_shortcuts_hint")}</p>
          <button type="button" className="btn btn-wide btn-accent" onClick={props.onSave}>
            {props.mode === "edit" ? props.t("save_workflow_edit") : props.t("save_workflow")}
          </button>
        </div>
      </section>
    </main>
  );
}
