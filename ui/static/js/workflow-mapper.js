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

      schemaParams[paramKey] = {
        exposed: false,
        node_id: Number.parseInt(nodeId, 10),
        field,
        name: field,
        type: typeGuess,
        required: false,
        description: "",
        currentVal: value,
        nodeClass: nodeObject.class_type || "UnknownNode",
      };
    });
  });

  return schemaParams;
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
