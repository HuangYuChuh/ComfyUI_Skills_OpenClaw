import { EditorMappingSection } from "./EditorMappingSection";
import { EditorWorkflowInfoCard } from "./EditorWorkflowInfoCard";
import type { EditorViewProps } from "./types";

export function EditorView(props: EditorViewProps) {
  const editorStep = !props.workflowId ? 1 : (!props.hasWorkflow ? 2 : 3);

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

      <EditorWorkflowInfoCard
        workflowId={props.workflowId}
        description={props.description}
        hasWorkflow={props.hasWorkflow}
        onWorkflowIdChange={props.onWorkflowIdChange}
        onDescriptionChange={props.onDescriptionChange}
        onUploadFile={props.onUploadFile}
        t={props.t}
      />

      <EditorMappingSection {...props} />
    </main>
  );
}
