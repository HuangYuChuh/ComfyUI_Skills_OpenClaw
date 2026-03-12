import { Modal } from "../../components/ui/Modal";
import type { CloudTemplateSummaryDto } from "../../types/api";

interface CloudTemplatesModalProps {
  open: boolean;
  source: "bundled" | "official";
  templates: CloudTemplateSummaryDto[];
  loading: boolean;
  summary: string;
  onClose: () => void;
  onChangeSource: (source: "bundled" | "official") => void;
  onImport: (template: CloudTemplateSummaryDto) => void;
  onTryRun: (workflowId: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function CloudTemplatesModal(props: CloudTemplatesModalProps) {
  return (
    <Modal
      open={props.open}
      title={props.t("cloud_templates_title")}
      onClose={props.onClose}
      actions={<button type="button" className="btn btn-secondary" onClick={props.onClose}>{props.t("cancel")}</button>}
    >
      <p className="form-help">{props.t("cloud_templates_help")}</p>
      <div className="template-source-toggle">
        <button
          type="button"
          className={`btn btn-secondary template-source-btn ${props.source === "bundled" ? "is-active" : ""}`}
          onClick={() => props.onChangeSource("bundled")}
        >
          {props.t("cloud_templates_source_bundled")}
        </button>
        <button
          type="button"
          className={`btn btn-secondary template-source-btn ${props.source === "official" ? "is-active" : ""}`}
          onClick={() => props.onChangeSource("official")}
        >
          {props.t("cloud_templates_source_official")}
        </button>
      </div>
      <div className="section-meta">{props.summary}</div>
      <div className="template-list">
        {props.loading ? <div className="empty-state">{props.t("loading")}</div> : null}
        {!props.loading && props.templates.length === 0 ? <div className="empty-state">{props.t("cloud_templates_empty")}</div> : null}
        {!props.loading ? props.templates.map((template) => {
          const canImport = props.source === "bundled" || template.supports_direct_run;
          return (
            <article key={template.id} className="template-item">
              <div className="template-item-header">
                <h4 className="template-item-title">{template.name || template.id}</h4>
                <span className="template-badge">{template.source_label}</span>
              </div>
              <p className="template-item-desc">{template.description}</p>
              <p className="template-item-meta">{template.supports_direct_run ? props.t("cloud_templates_runnable") : props.t("cloud_templates_blueprint_note")}</p>
              {template.tags?.length ? (
                <div className="template-tag-row">
                  {template.tags.slice(0, 3).map((tag) => <span key={tag} className="workflow-meta-tag">{tag}</span>)}
                </div>
              ) : null}
              <div className="template-item-actions">
                {template.installed_workflow_id ? (
                  <button type="button" className="btn btn-secondary" onClick={() => props.onTryRun(template.installed_workflow_id!)}>
                    {props.t("cloud_templates_try_run")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={template.installed || !canImport}
                  onClick={() => props.onImport(template)}
                >
                  {template.installed
                    ? props.t("cloud_templates_imported")
                    : (canImport ? props.t("cloud_templates_import") : props.t("cloud_templates_blueprint_only"))}
                </button>
              </div>
            </article>
          );
        }) : null}
      </div>
    </Modal>
  );
}
