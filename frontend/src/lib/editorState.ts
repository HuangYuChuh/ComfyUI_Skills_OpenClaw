import type { SchemaParam, SchemaParamMap } from "../types/editor";

export function applyEditorParamUpdate(
  schemaParams: SchemaParamMap,
  expandedParamKeys: Set<string>,
  key: string,
  field: keyof SchemaParam | "name" | "description" | "required" | "type" | "exposed",
  value: unknown,
) {
  const nextSchemaParams: SchemaParamMap = {
    ...schemaParams,
    [key]: {
      ...schemaParams[key],
      [field]: value,
    },
  };

  const nextExpandedParamKeys = new Set(expandedParamKeys);
  if (field === "exposed" && value === false) {
    nextExpandedParamKeys.delete(key);
  }

  return {
    schemaParams: nextSchemaParams,
    expandedParamKeys: nextExpandedParamKeys,
  };
}

export function applyVisibleExposure(
  schemaParams: SchemaParamMap,
  expandedParamKeys: Set<string>,
  visibleKeys: string[],
  exposed: boolean,
) {
  const nextSchemaParams: SchemaParamMap = { ...schemaParams };
  const nextExpandedParamKeys = new Set(expandedParamKeys);
  let changedCount = 0;

  visibleKeys.forEach((key) => {
    const param = nextSchemaParams[key];
    if (!param || param.exposed === exposed) {
      return;
    }

    nextSchemaParams[key] = {
      ...param,
      exposed,
      name: exposed ? (param.name || param.field) : param.name,
    };
    if (!exposed) {
      nextExpandedParamKeys.delete(key);
    }
    changedCount += 1;
  });

  return {
    schemaParams: nextSchemaParams,
    expandedParamKeys: nextExpandedParamKeys,
    changedCount,
  };
}
