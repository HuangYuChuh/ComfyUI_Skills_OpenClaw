export function getElements() {
  const $ = window.jQuery;
  return {
    langToggle: $("#lang-toggle"),
    configUrl: $("#config-url"),
    configOutput: $("#config-out"),
    saveConfigButton: $("#save-config-btn"),
    workflowList: $("#workflow-list"),
    workflowSummary: $("#workflow-summary"),
    uploadZone: $("#upload-zone"),
    fileUpload: $("#file-upload"),
    mappingSection: $("#mapping-section"),
    workflowId: $("#wf-id"),
    workflowDescription: $("#wf-desc"),
    nodesContainer: $("#nodes-container"),
    saveWorkflowButton: $("#save-workflow-btn"),
    editorModeBadge: $("#editor-mode-badge"),
    toastContainer: $("#toast-container"),
  };
}
