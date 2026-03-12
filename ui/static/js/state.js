function normalizeLanguage(language) {
  if (!language) {
    return "en";
  }

  const value = String(language).toLowerCase();
  if (value === "zh" || value === "zh-cn" || value === "zh_hans") {
    return "zh";
  }
  if (value === "zh_hant" || value === "zh-tw" || value === "zh-hant") {
    return "zh_hant";
  }
  return "en";
}

function readCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function detectBrowserLanguage() {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
    navigator.userLanguage,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (normalized !== "en" || String(candidate || "").toLowerCase().startsWith("en")) {
      return normalized;
    }
  }

  return "en";
}

function writeCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function getPersistedLanguage() {
  let stored = null;
  try {
    stored = localStorage.getItem("ui-lang");
  } catch {
    stored = null;
  }
  stored = stored || readCookie("ui-lang");
  if (stored) {
    return normalizeLanguage(stored);
  }
  return detectBrowserLanguage();
}

const state = {
  currentLang: getPersistedLanguage(),
  currentUploadData: null,
  schemaParams: {},
  workflows: [],
  editingWorkflowId: null,
  // Multi-server state
  servers: [],
  currentServerId: localStorage.getItem("ui-server") || null,
  defaultServerId: null,
};

export function getState() {
  return state;
}

export function setLanguage(language) {
  const normalized = normalizeLanguage(language);
  state.currentLang = normalized;
  try {
    localStorage.setItem("ui-lang", normalized);
  } catch {
    // Fallback to cookie-only persistence if storage is unavailable.
  }
  writeCookie("ui-lang", normalized);
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

// Multi-server state management

export function setServers(servers) {
  state.servers = servers;
}

export function setDefaultServerId(defaultServerId) {
  state.defaultServerId = defaultServerId;
}

export function setCurrentServerId(serverId) {
  state.currentServerId = serverId;
  if (serverId) {
    localStorage.setItem("ui-server", serverId);
  }
}

export function getCurrentServerId() {
  return state.currentServerId || state.defaultServerId || (state.servers[0]?.id ?? null);
}

export function getCurrentServer() {
  const sid = getCurrentServerId();
  return state.servers.find((s) => s.id === sid) || null;
}
