function getBaseFileName(fileName: string) {
  if (!fileName || typeof fileName !== "string") {
    return "";
  }

  return fileName.replace(/\.[^.]+$/, "").trim();
}

function getFirstNodeTitle(workflowData: Record<string, unknown>) {
  if (!workflowData || typeof workflowData !== "object" || Array.isArray(workflowData)) {
    return "";
  }

  for (const nodeObject of Object.values(workflowData)) {
    const title = (nodeObject as { _meta?: { title?: string } } | null)?._meta?.title;
    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }
  }

  return "";
}

function normalizeWorkflowIdCandidate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/[./\\]+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function suggestWorkflowId(workflowData: Record<string, unknown>, fileName = "") {
  const workflowMeta = workflowData as {
    workflow_name?: string;
    name?: string;
    title?: string;
    _meta?: { title?: string };
    extra?: { workflow_name?: string; name?: string; title?: string };
    metadata?: { workflow_name?: string; name?: string; title?: string };
  };

  const candidates = [
    workflowMeta.workflow_name,
    workflowMeta.name,
    workflowMeta.title,
    workflowMeta._meta?.title,
    workflowMeta.extra?.workflow_name,
    workflowMeta.extra?.name,
    workflowMeta.extra?.title,
    workflowMeta.metadata?.workflow_name,
    workflowMeta.metadata?.name,
    workflowMeta.metadata?.title,
    getBaseFileName(fileName),
    getFirstNodeTitle(workflowData),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWorkflowIdCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "workflow";
}
