export function getElements() {
  const $ = window.jQuery;
  return {
    langToggle: $("#lang-toggle"),
    // ── View containers ──
    viewMain: $("#view-main"),
    viewEditor: $("#view-editor"),
    // ── Server panel ──
    serverSelector: $("#server-selector"),
    serverEnabledToggle: $("#server-enabled-toggle"),
    serverEnabledLabel: $("#server-enabled-label"),
    deleteServerBtn: $("#delete-server-btn"),
    currentServerActions: $("#current-server-actions"),
    // ── Edit Panel elements ──
    btnEditServer: $("#btn-edit-server"),
    btnCancelEditServer: $("#btn-cancel-edit-server"),
    currentServerConfigPanel: $("#current-server-config-panel"),
    // ── Config ──
    configUrl: $("#config-url"),
    configOutput: $("#config-out"),
    saveConfigButton: $("#save-config-btn"),
    // ── Workflow list ──
    workflowList: $("#workflow-list"),
    workflowSummary: $("#workflow-summary"),
    addWorkflowBtn: $("#add-workflow-btn"),
    // ── Editor (View 2) ──
    editorBackBtn: $("#editor-back-btn"),
    editorModeBadge: $("#editor-mode-badge"),
    uploadZone: $("#upload-zone"),
    fileUpload: $("#file-upload"),
    mappingSection: $("#mapping-section"),
    workflowId: $("#wf-id"),
    workflowDescription: $("#wf-desc"),
    nodesContainer: $("#nodes-container"),
    saveWorkflowButton: $("#save-workflow-btn"),
    toastContainer: $("#toast-container"),
  };
}
