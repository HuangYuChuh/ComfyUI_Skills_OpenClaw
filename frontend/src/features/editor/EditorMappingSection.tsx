import { CustomSelect } from "../../components/ui/CustomSelect";
import { MappingNodeCard } from "./MappingNodeCard";
import type { EditorViewProps } from "./types";

type EditorMappingSectionProps = Pick<
  EditorViewProps,
  | "hasWorkflow"
  | "upgradeSummary"
  | "filters"
  | "searchInputRef"
  | "onFilterChange"
  | "onApplyRecommended"
  | "onExposeVisible"
  | "onCollapseAll"
  | "onResetFilters"
  | "summaryText"
  | "groupedNodes"
  | "emptyStateMessageKey"
  | "collapsedNodeIds"
  | "expandedParamKeys"
  | "onToggleNode"
  | "onToggleParamConfig"
  | "onUpdateParam"
  | "mode"
  | "onSave"
  | "t"
>;

export function EditorMappingSection(props: EditorMappingSectionProps) {
  return (
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
          <MappingNodeCard
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
  );
}
