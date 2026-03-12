import type { SchemaParam, SchemaParamMap } from "../../types/editor";

export function groupSchemaParams(schemaParams: SchemaParamMap) {
  const grouped = new Map<number, { classType: string; params: Array<SchemaParam & { key: string }> }>();

  Object.entries(schemaParams).forEach(([key, value]) => {
    if (!grouped.has(value.node_id)) {
      grouped.set(value.node_id, {
        classType: value.nodeClass,
        params: [],
      });
    }
    grouped.get(value.node_id)?.params.push({ key, ...value });
  });

  return Array.from(grouped.entries()).sort((first, second) => Number(first[0]) - Number(second[0]));
}

type FinalSchemaField = {
  node_id: number;
  field: string;
  required: boolean;
  type: SchemaParam["type"];
  description: string;
  default?: unknown;
  example?: unknown;
  choices?: unknown[];
};

export function buildFinalSchema(schemaParams: SchemaParamMap) {
  const finalSchema: Record<string, FinalSchemaField> = {};
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

    const key = parameter.name.trim();
    finalSchema[key] = {
      node_id: parameter.node_id,
      field: parameter.field,
      required: Boolean(parameter.required),
      type: parameter.type,
      description: parameter.description || "",
    };

    if (parameter.default !== undefined) {
      finalSchema[key].default = parameter.default;
    }
    if (parameter.example !== undefined) {
      finalSchema[key].example = parameter.example;
    }
    if (Array.isArray(parameter.choices) && parameter.choices.length) {
      finalSchema[key].choices = parameter.choices;
    }
  }

  return {
    finalSchema,
    exposedCount,
    missingAlias: null,
  };
}
