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
