export function parseWorkflowUpload(fileContent) {
  const workflowData = JSON.parse(fileContent);

  if (isEditorWorkflow(workflowData)) {
    const error = new Error("Unsupported ComfyUI editor workflow format");
    error.code = "EDITOR_WORKFLOW_FORMAT";
    throw error;
  }

  const schemaParams = extractSchemaParams(workflowData);

  return {
    workflowData,
    schemaParams,
  };
}

export function suggestWorkflowId(workflowData, fileName = "") {
  const candidates = [
    workflowData?.workflow_name,
    workflowData?.name,
    workflowData?.title,
    workflowData?._meta?.title,
    workflowData?.extra?.workflow_name,
    workflowData?.extra?.name,
    workflowData?.extra?.title,
    workflowData?.metadata?.workflow_name,
    workflowData?.metadata?.name,
    workflowData?.metadata?.title,
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

function normalizeCompareText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isEditorWorkflow(workflowData) {
  return Boolean(
    workflowData &&
    typeof workflowData === "object" &&
    !Array.isArray(workflowData) &&
    Array.isArray(workflowData.nodes) &&
    Array.isArray(workflowData.links),
  );
}

export function extractSchemaParams(workflowData) {
  const schemaParams = {};

  Object.entries(workflowData).forEach(([nodeId, nodeObject]) => {
    if (!nodeObject?.inputs) {
      return;
    }

    Object.entries(nodeObject.inputs).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        return;
      }

      const paramKey = `${nodeId}_${field}`;
      let typeGuess = "string";
      if (typeof value === "number") {
        typeGuess = Number.isInteger(value) ? "int" : "float";
      } else if (typeof value === "boolean") {
        typeGuess = "boolean";
      }

      // --- AI NATIVE: Heuristic Auto-Configuration ---
      let shouldExpose = false;
      let autoName = field;
      let autoDesc = "";
      let isRequired = false;
      const cType = nodeObject.class_type || "";

      if (cType.includes("KSampler")) {
        if (field === "seed") {
          shouldExpose = true;
          autoDesc = "Random seed (for reproducibility)";
        }
        if (field === "steps") {
          shouldExpose = true;
          autoDesc = "Generation steps";
        }
      } else if (cType.includes("CLIPTextEncode") || cType.includes("Text") || cType.includes("Prompt")) {
        if (field === "text" || field === "prompt") {
          shouldExpose = true;
          isRequired = true;
          autoName = `prompt_${nodeId}`;
          autoDesc = "Text prompt description";
        }
      } else if (cType === "EmptyLatentImage") {
        if (field === "width" || field === "height" || field === "batch_size") {
          shouldExpose = true;
          autoDesc = `Image ${field}`;
        }
      } else if (cType === "SaveImage") {
        if (field === "filename_prefix") {
          shouldExpose = true;
          autoDesc = "Output file prefix";
        }
      } else if (cType === "LightCCDoubaoImageNode") {
        if (field === "prompt") {
          shouldExpose = true;
          isRequired = true;
          autoDesc = "Positive image prompt";
        }
        if (field === "size") {
          shouldExpose = true;
          autoDesc = "e.g., 1:1,2048x2048";
        }
        if (field === "seed") {
          shouldExpose = true;
          autoDesc = "Random seed";
        }
        if (field === "num") {
          shouldExpose = true;
          autoDesc = "Number of images to generate";
        }
      }

      schemaParams[paramKey] = {
        exposed: shouldExpose,
        node_id: Number.parseInt(nodeId, 10),
        field,
        name: autoName,
        type: typeGuess,
        required: isRequired,
        description: autoDesc,
        currentVal: value,
        nodeClass: cType || "UnknownNode",
      };
    });
  });

  return schemaParams;
}

function getBaseFileName(fileName) {
  if (!fileName || typeof fileName !== "string") {
    return "";
  }

  return fileName.replace(/\.[^.]+$/, "").trim();
}

function getFirstNodeTitle(workflowData) {
  if (!workflowData || typeof workflowData !== "object" || Array.isArray(workflowData)) {
    return "";
  }

  for (const nodeObject of Object.values(workflowData)) {
    const title = nodeObject?._meta?.title;
    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }
  }

  return "";
}

function normalizeWorkflowIdCandidate(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .trim()
    .replace(/[./\\]+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized;
}

function buildFallbackCandidateIndex(previousSchemaParams) {
  const indexes = {
    byFieldAndClass: new Map(),
    byFieldAndType: new Map(),
    byAliasAndType: new Map(),
  };

  Object.entries(previousSchemaParams || {}).forEach(([key, parameter]) => {
    if (!parameter || typeof parameter !== "object") {
      return;
    }

    const field = normalizeCompareText(parameter.field);
    const nodeClass = normalizeCompareText(parameter.nodeClass);
    const type = normalizeCompareText(parameter.type);
    const alias = normalizeCompareText(parameter.name);

    const fieldAndClassKey = `${field}|${nodeClass}`;
    const fieldAndTypeKey = `${field}|${type}`;
    const aliasAndTypeKey = `${alias}|${type}`;

    if (!indexes.byFieldAndClass.has(fieldAndClassKey)) {
      indexes.byFieldAndClass.set(fieldAndClassKey, []);
    }
    indexes.byFieldAndClass.get(fieldAndClassKey).push([key, parameter]);

    if (!indexes.byFieldAndType.has(fieldAndTypeKey)) {
      indexes.byFieldAndType.set(fieldAndTypeKey, []);
    }
    indexes.byFieldAndType.get(fieldAndTypeKey).push([key, parameter]);

    if (alias) {
      if (!indexes.byAliasAndType.has(aliasAndTypeKey)) {
        indexes.byAliasAndType.set(aliasAndTypeKey, []);
      }
      indexes.byAliasAndType.get(aliasAndTypeKey).push([key, parameter]);
    }
  });

  return indexes;
}

function getUniqueFallbackMatch(parameter, candidateIndex, matchedPreviousKeys) {
  const candidates = [];
  const field = normalizeCompareText(parameter.field);
  const nodeClass = normalizeCompareText(parameter.nodeClass);
  const type = normalizeCompareText(parameter.type);
  const alias = normalizeCompareText(parameter.name);

  const fieldAndClassKey = `${field}|${nodeClass}`;
  const fieldAndTypeKey = `${field}|${type}`;
  const aliasAndTypeKey = `${alias}|${type}`;

  [
    candidateIndex.byFieldAndClass.get(fieldAndClassKey),
    candidateIndex.byFieldAndType.get(fieldAndTypeKey),
    alias ? candidateIndex.byAliasAndType.get(aliasAndTypeKey) : null,
  ].forEach((entries) => {
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach((entry) => candidates.push(entry));
  });

  const availableCandidates = candidates.filter(([key]) => !matchedPreviousKeys.has(key));
  const uniqueCandidates = [];
  const seen = new Set();
  availableCandidates.forEach(([key, candidate]) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    uniqueCandidates.push([key, candidate]);
  });

  if (uniqueCandidates.length !== 1) {
    return null;
  }

  return uniqueCandidates[0];
}

function mergeSchemaParam(nextParam, previousParam, migrationStatus, migrationReason = "") {
  const merged = {
    ...nextParam,
    exposed: Boolean(previousParam.exposed),
    name: previousParam.name || nextParam.name,
    type: previousParam.type || nextParam.type,
    required: Boolean(previousParam.required),
    description: previousParam.description || "",
    migrationStatus,
    migrationReason,
  };

  if (previousParam.type && nextParam.type && previousParam.type !== nextParam.type) {
    merged.type = nextParam.type;
    merged.migrationStatus = "review";
    merged.migrationReason = "type_changed";
  }

  return merged;
}

export function migrateSchemaParams(previousSchemaParams, nextSchemaParams) {
  const previousEntries = Object.entries(previousSchemaParams || {});
  const mergedSchemaParams = {};
  const matchedPreviousKeys = new Set();
  const candidateIndex = buildFallbackCandidateIndex(previousSchemaParams);
  const summary = {
    retained: 0,
    review: 0,
    added: 0,
    removed: 0,
    matched: [],
    addedKeys: [],
    removedKeys: [],
  };

  Object.entries(nextSchemaParams || {}).forEach(([key, nextParam]) => {
    const previousParam = previousSchemaParams?.[key];

    if (previousParam) {
      matchedPreviousKeys.add(key);
      mergedSchemaParams[key] = mergeSchemaParam(nextParam, previousParam, "retained");
      summary.retained += 1;
      summary.matched.push({ previousKey: key, nextKey: key, status: "retained" });
      return;
    }

    const fallbackMatch = getUniqueFallbackMatch(nextParam, candidateIndex, matchedPreviousKeys);
    if (fallbackMatch) {
      const [previousKey, matchedParam] = fallbackMatch;
      matchedPreviousKeys.add(previousKey);
      mergedSchemaParams[key] = mergeSchemaParam(nextParam, matchedParam, "review", "fallback_match");
      summary.review += 1;
      summary.matched.push({ previousKey, nextKey: key, status: "review" });
      return;
    }

    mergedSchemaParams[key] = {
      ...nextParam,
      migrationStatus: "new",
      migrationReason: "new_param",
    };
    summary.added += 1;
    summary.addedKeys.push(key);
  });

  previousEntries.forEach(([key]) => {
    if (matchedPreviousKeys.has(key)) {
      return;
    }
    summary.removed += 1;
    summary.removedKeys.push(key);
  });

  return {
    schemaParams: mergedSchemaParams,
    summary,
  };
}

export function groupSchemaParams(schemaParams) {
  const grouped = new Map();

  Object.entries(schemaParams).forEach(([key, value]) => {
    if (!grouped.has(value.node_id)) {
      grouped.set(value.node_id, {
        classType: value.nodeClass,
        params: [],
      });
    }

    grouped.get(value.node_id).params.push({ key, ...value });
  });

  return Array.from(grouped.entries()).sort((first, second) => Number(first[0]) - Number(second[0]));
}

export function buildFinalSchema(schemaParams) {
  const finalSchema = {};
  let exposedCount = 0;

  for (const parameter of Object.values(schemaParams)) {
    if (!parameter.exposed) {
      continue;
    }

    exposedCount += 1;
    if (!parameter.name || !parameter.name.trim()) {
      return {
        finalSchema: null,
        exposedCount,
        missingAlias: parameter,
      };
    }

    finalSchema[parameter.name.trim()] = {
      node_id: parameter.node_id,
      field: parameter.field,
      required: Boolean(parameter.required),
      type: parameter.type,
      description: parameter.description || "",
    };
  }

  return {
    finalSchema,
    exposedCount,
    missingAlias: null,
  };
}
