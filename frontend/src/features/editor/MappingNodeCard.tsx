import { CustomSelect } from "../../components/ui/CustomSelect";
import type { SchemaParam } from "../../types/editor";
import type { MappingParam } from "./types";

function renderTypeOptions(t: (key: string) => string) {
  return [
    { value: "string", label: t("type_str") },
    { value: "int", label: t("type_int") },
    { value: "float", label: t("type_float") },
    { value: "boolean", label: t("type_bool") },
  ];
}

interface MappingNodeCardProps {
  nodeId: string;
  classType: string;
  params: MappingParam[];
  collapsed: boolean;
  expandedParamKeys: Set<string>;
  onToggleNode: (nodeId: string) => void;
  onToggleParamConfig: (key: string) => void;
  onUpdateParam: (
    key: string,
    field: keyof SchemaParam | "name" | "exposed" | "description" | "required" | "type",
    value: unknown,
  ) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function MappingNodeCard(props: MappingNodeCardProps) {
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
