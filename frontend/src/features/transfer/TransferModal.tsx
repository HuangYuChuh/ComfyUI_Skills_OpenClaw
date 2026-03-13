import { useEffect, useMemo, useRef } from "react";
import { Modal } from "../../components/ui/Modal";
import type {
  TransferExportPreviewDto,
  TransferExportPreviewServerDto,
  TransferPlanItemDto,
  TransferSelectionPayload,
} from "../../types/api";

type TransferMode = "export" | "import" | null;

interface TransferModalProps {
  open: boolean;
  mode: TransferMode;
  exportPreview: TransferExportPreviewDto | null;
  exportSelection: TransferSelectionPayload;
  expandedServerIds: string[];
  importPreviewSummary: string;
  importSections: Array<{ title: string; items: TransferPlanItemDto[] }>;
  importWarnings: string[];
  applyEnvironment: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onToggleServerSelection: (server: TransferExportPreviewServerDto) => void;
  onToggleWorkflowSelection: (serverId: string, workflowId: string) => void;
  onToggleServerExpanded: (serverId: string) => void;
  onApplyEnvironmentChange: (checked: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function TransferWarningBox({ warnings, t }: { warnings: string[]; t: TransferModalProps["t"] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="transfer-warning-list">
      <p className="transfer-warning-title">{t("transfer_warning_title")}</p>
      {warnings.map((warning) => (
        <p key={warning} className="transfer-warning-item">{warning}</p>
      ))}
    </div>
  );
}

function TransferExportServer({
  server,
  selectedWorkflowIds,
  expanded,
  onToggleServerSelection,
  onToggleWorkflowSelection,
  onToggleExpanded,
  t,
}: {
  server: TransferExportPreviewServerDto;
  selectedWorkflowIds: string[];
  expanded: boolean;
  onToggleServerSelection: (server: TransferExportPreviewServerDto) => void;
  onToggleWorkflowSelection: (serverId: string, workflowId: string) => void;
  onToggleExpanded: (serverId: string) => void;
  t: TransferModalProps["t"];
}) {
  const total = server.workflows.length;
  const selectedCount = selectedWorkflowIds.length;
  const allSelected = total > 0 && selectedCount === total;
  const partiallySelected = selectedCount > 0 && selectedCount < total;
  const serverCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (serverCheckboxRef.current) {
      serverCheckboxRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  return (
    <article className={`transfer-export-server ${expanded ? "is-open" : ""}`}>
      <div className="transfer-export-server-head">
        <label className="transfer-export-item transfer-export-item-summary">
          <input
            ref={serverCheckboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleServerSelection(server)}
          />
          <span className="transfer-export-item-copy">
            <span className="transfer-export-server-title-row">
              <span>{server.name || server.server_id}</span>
              {!server.enabled ? <span className="transfer-chip transfer-chip-muted">{t("export_server_disabled")}</span> : null}
            </span>
            <span className="transfer-export-item-meta">
              {t("export_selected_count", { selected: selectedCount, total })}
            </span>
          </span>
        </label>

        <button
          type="button"
          className="btn btn-secondary btn-icon transfer-export-toggle"
          aria-label={t("export_toggle_server", { server: server.name || server.server_id })}
          onClick={() => onToggleExpanded(server.server_id)}
        >
          <span className="transfer-export-chevron" aria-hidden="true" />
        </button>
      </div>

      <div className="transfer-export-workflows-wrap">
        <div className="transfer-export-workflows">
          {server.workflows.map((workflow) => (
            <label key={`${server.server_id}-${workflow.workflow_id}`} className="transfer-export-item">
              <input
                type="checkbox"
                checked={selectedWorkflowIds.includes(workflow.workflow_id)}
                onChange={() => onToggleWorkflowSelection(server.server_id, workflow.workflow_id)}
              />
              <span className="transfer-export-item-copy">
                <span className="transfer-export-workflow-title-row">
                  <span>{workflow.workflow_id}</span>
                  {!workflow.enabled ? <span className="transfer-chip transfer-chip-muted">{t("export_workflow_disabled")}</span> : null}
                </span>
                {workflow.description ? <span className="transfer-export-item-meta">{workflow.description}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </div>
    </article>
  );
}

function TransferImportSection({
  title,
  items,
  t,
}: {
  title: string;
  items: TransferPlanItemDto[];
  t: TransferModalProps["t"];
}) {
  return (
    <section className="transfer-section">
      <h4 className="transfer-section-title">{title}</h4>
      {items.length === 0 ? (
        <p className="transfer-empty">{t("transfer_section_empty")}</p>
      ) : (
        <ul className="transfer-list">
          {items.map((item, index) => (
            <li key={`${item.server_id}-${item.workflow_id || "server"}-${index}`}>
              {item.workflow_id ? `${item.server_id}/${item.workflow_id}` : item.server_id}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TransferModal(props: TransferModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleClose = props.loading ? () => undefined : props.onClose;
  const selectedWorkflowCount = useMemo(
    () => props.exportSelection.servers.reduce((count, server) => count + server.workflow_ids.length, 0),
    [props.exportSelection],
  );
  const exportWarnings = props.exportPreview?.warnings.map((warning) => warning.message) || [];
  const importConfirmDisabled = props.loading;
  const exportConfirmDisabled = props.loading || selectedWorkflowCount === 0;

  return (
    <Modal
      open={props.open}
      width="wide"
      title={props.mode === "export" ? props.t("export_bundle_title") : props.t("import_bundle_preview_title")}
      onClose={handleClose}
      initialFocusRef={confirmButtonRef}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" disabled={props.loading} onClick={handleClose}>{props.t("cancel")}</button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="btn btn-primary"
            disabled={props.mode === "export" ? exportConfirmDisabled : importConfirmDisabled}
            onClick={props.onConfirm}
          >
            {props.mode === "export" ? props.t("export_bundle_confirm") : props.t("import_bundle_confirm")}
          </button>
        </>
      )}
    >
      {props.mode === "export" ? (
        <div className="transfer-modal-body">
          <section className="transfer-panel">
            <p className="transfer-hint">{props.t("export_panel_hint")}</p>
            <p className="confirm-modal-message">
              {props.t("export_preview_summary", {
                servers: props.exportSelection.servers.filter((server) => server.workflow_ids.length > 0).length,
                workflows: selectedWorkflowCount,
                warnings: props.exportPreview?.summary.warnings || 0,
              })}
            </p>
            <div className="transfer-export-tree">
              {(props.exportPreview?.servers || []).map((server) => {
                const selected = props.exportSelection.servers.find((item) => item.server_id === server.server_id);
                return (
                  <TransferExportServer
                    key={server.server_id}
                    server={server}
                    selectedWorkflowIds={selected?.workflow_ids || []}
                    expanded={props.expandedServerIds.includes(server.server_id)}
                    onToggleServerSelection={props.onToggleServerSelection}
                    onToggleWorkflowSelection={props.onToggleWorkflowSelection}
                    onToggleExpanded={props.onToggleServerExpanded}
                    t={props.t}
                  />
                );
              })}
            </div>
            <TransferWarningBox warnings={exportWarnings} t={props.t} />
          </section>
        </div>
      ) : (
        <div className="transfer-modal-body">
          <section className="transfer-panel">
            <p className="confirm-modal-message">{props.importPreviewSummary}</p>
            <div className="transfer-sections">
              {props.importSections.map((section) => (
                <TransferImportSection key={section.title} title={section.title} items={section.items} t={props.t} />
              ))}
            </div>
            <label className="checkbox-inline confirm-modal-checkbox" htmlFor="transfer-import-apply-environment">
              <input
                id="transfer-import-apply-environment"
                type="checkbox"
                checked={props.applyEnvironment}
                onChange={(event) => props.onApplyEnvironmentChange(event.target.checked)}
              />
              <span>{props.t("transfer_apply_environment")}</span>
            </label>
            <TransferWarningBox warnings={props.importWarnings} t={props.t} />
          </section>
        </div>
      )}
    </Modal>
  );
}
