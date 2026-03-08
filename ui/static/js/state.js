const state = {
  currentLang: localStorage.getItem("ui-lang") || "en",
  currentUploadData: null,
  schemaParams: {},
  workflows: [],
  editingWorkflowId: null,
};

export function getState() {
  return state;
}

export function setLanguage(language) {
  state.currentLang = language;
  localStorage.setItem("ui-lang", language);
}

export function toggleLanguage() {
  const nextLanguage = state.currentLang === "en" ? "zh" : "en";
  setLanguage(nextLanguage);
  return nextLanguage;
}

export function setUploadData(workflowData) {
  state.currentUploadData = workflowData;
}

export function setSchemaParams(schemaParams) {
  state.schemaParams = schemaParams;
}

export function updateSchemaParam(key, field, value) {
  if (!state.schemaParams[key]) {
    return;
  }
  state.schemaParams[key][field] = value;
}

export function resetMappingState() {
  state.currentUploadData = null;
  state.schemaParams = {};
}

export function setWorkflows(workflows) {
  state.workflows = workflows;
}

export function setEditingWorkflowId(workflowId) {
  state.editingWorkflowId = workflowId;
}
