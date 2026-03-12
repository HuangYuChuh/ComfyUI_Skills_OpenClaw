import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "../../components/ui/CustomSelect";
import type { WorkflowSummaryDto } from "../../types/api";

interface WorkflowManagerProps {
  workflows: WorkflowSummaryDto[];
  allWorkflowsForCurrentServer: number;
  search: string;
  sort: string;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onCreateWorkflow: () => void;
  onEditWorkflow: (workflow: WorkflowSummaryDto) => void;
  onDeleteWorkflow: (workflow: WorkflowSummaryDto) => void;
  onToggleWorkflow: (workflow: WorkflowSummaryDto, enabled: boolean) => void;
  onUploadWorkflowVersion: (workflow: WorkflowSummaryDto) => void;
  onReorderWorkflows: (sourceWorkflowId: string, targetWorkflowId: string, placeAfter: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-edit"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
      <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" />
      <path d="M16 5l3 3" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-dots-vertical"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-upload"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 9l5 -5l5 5" />
      <path d="M12 4l0 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-trash"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export function WorkflowManager(props: WorkflowManagerProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const dragEnabled = props.sort === "custom" && !props.search.trim();

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".workflow-more")) {
        setOpenMenuId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const summary = props.allWorkflowsForCurrentServer === props.workflows.length
    ? props.t("workflow_count", { count: props.workflows.length })
    : props.t("workflow_count_filtered", { visible: props.workflows.length, total: props.allWorkflowsForCurrentServer });

  const sortOptions = useMemo(() => [
    { value: "custom", label: props.t("workflow_sort_custom") },
    { value: "updated_desc", label: props.t("workflow_sort_recent") },
    { value: "name_asc", label: props.t("workflow_sort_name_asc") },
    { value: "name_desc", label: props.t("workflow_sort_name_desc") },
    { value: "enabled_first", label: props.t("workflow_sort_enabled") },
  ], [props.t]);

  return (
    <section className="card" aria-labelledby="workflow-manager-title">
      <div className="section-header panel-toolbar">
        <div className="panel-title-wrap">
          <h2 id="workflow-manager-title" className="card-title">{props.t("workflow_manager")}</h2>
        </div>
        <div className="panel-actions">
          {props.allWorkflowsForCurrentServer ? <p className="section-meta panel-meta">{summary}</p> : null}
          <button type="button" className="btn btn-secondary panel-action-btn" onClick={props.onCreateWorkflow}>
            {props.t("register_new_short")}
          </button>
        </div>
      </div>

      <div className="workflow-toolbar">
        <input
          id="workflow-search"
          className="input-field"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={props.t("workflow_search_placeholder")}
        />
        <CustomSelect
          value={props.sort}
          options={sortOptions}
          ariaLabel={props.t("workflow_sort_custom")}
          className="is-server-select"
          onChange={props.onSortChange}
        />
      </div>

      <div className="workflow-list" aria-live="polite">
        {props.workflows.length === 0 ? (
          <div className="empty-state">{props.allWorkflowsForCurrentServer ? props.t("no_workflows_match") : props.t("no_workflows")}</div>
        ) : props.workflows.map((workflow) => (
          <article
            key={`${workflow.server_id}-${workflow.id}`}
            className={`workflow-item ${dragEnabled ? "is-reorderable" : ""}`}
            data-workflow-id={workflow.id}
            data-server-id={workflow.server_id}
            onDragOver={(event) => {
              if (!dragEnabled) {
                return;
              }
              event.preventDefault();
              (event.currentTarget as HTMLElement).classList.add("is-drop-target");
            }}
            onDragLeave={(event) => {
              (event.currentTarget as HTMLElement).classList.remove("is-drop-target");
            }}
            onDrop={(event) => {
              if (!dragEnabled) {
                return;
              }
              event.preventDefault();
              const target = event.currentTarget as HTMLElement;
              target.classList.remove("is-drop-target");
              const sourceWorkflowId = event.dataTransfer.getData("text/plain");
              if (!sourceWorkflowId || sourceWorkflowId === workflow.id) {
                return;
              }
              const rect = target.getBoundingClientRect();
              props.onReorderWorkflows(sourceWorkflowId, workflow.id, event.clientY > rect.top + rect.height / 2);
            }}
          >
            <div className="workflow-main">
              <div className="workflow-name-row">
                <span className={`status-dot ${workflow.enabled ? "" : "is-disabled"}`} aria-hidden="true">&#x25CF;</span>
                <span className="workflow-name">{workflow.id}</span>
                <span className="workflow-server-tag">{workflow.server_name || workflow.server_id}</span>
              </div>
              {workflow.description ? <p className="workflow-desc">{workflow.description}</p> : null}
            </div>

            <div className="workflow-actions">
              {props.sort === "custom" ? (
                <button
                  type="button"
                  className={`btn btn-secondary btn-icon workflow-drag-handle ${dragEnabled ? "" : "is-disabled"}`}
                  draggable={dragEnabled}
                  aria-label={props.t("workflow_drag_handle", { id: workflow.id })}
                  title={props.t("workflow_drag_handle", { id: workflow.id })}
                  tabIndex={-1}
                  onDragStart={(event) => {
                    if (!dragEnabled) {
                      event.preventDefault();
                      return;
                    }
                    event.currentTarget.closest(".workflow-item")?.classList.add("is-dragging");
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", workflow.id);
                  }}
                  onDragEnd={(event) => {
                    event.currentTarget.closest(".workflow-item")?.classList.remove("is-dragging");
                    document.querySelectorAll(".workflow-item.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
                  }}
                >
                  <span aria-hidden="true">&#x2261;</span>
                </button>
              ) : null}

              <div className="workflow-status-toggle">
                <label className="toggle-inline" aria-label={props.t("toggle_workflow", { id: workflow.id })}>
                  <span className={`workflow-enabled-label ${workflow.enabled ? "status-on" : "status-off"}`}>
                    {workflow.enabled ? props.t("wf_enabled") : props.t("wf_disabled")}
                  </span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={workflow.enabled}
                      onChange={(event) => {
                        setOpenMenuId(null);
                        props.onToggleWorkflow(workflow, event.target.checked);
                      }}
                    />
                    <span className="slider" />
                  </div>
                </label>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-icon workflow-action-btn workflow-action-edit"
                aria-label={props.t("edit_workflow", { id: workflow.id })}
                onClick={() => {
                  setOpenMenuId(null);
                  props.onEditWorkflow(workflow);
                }}
              >
                <EditIcon />
              </button>

              <div className={`workflow-more ${openMenuId === workflow.id ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon workflow-action-btn workflow-more-trigger"
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === workflow.id}
                  aria-label={props.t("workflow_more_actions", { id: workflow.id })}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId((current) => current === workflow.id ? null : workflow.id);
                  }}
                >
                  <MoreIcon />
                </button>
                <div className={`workflow-more-menu ${openMenuId === workflow.id ? "" : "hidden"}`} role="menu">
                  <button
                    type="button"
                    className="workflow-more-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      props.onUploadWorkflowVersion(workflow);
                    }}
                  >
                    <UploadIcon />
                    <span>{props.t("upload_new_version")}</span>
                  </button>
                  <button
                    type="button"
                    className="workflow-more-item workflow-more-item-danger"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      props.onDeleteWorkflow(workflow);
                    }}
                  >
                    <TrashIcon />
                    <span>{props.t("delete")}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
