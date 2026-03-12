import type { SchemaParam, SchemaParamMap, UpgradeSummary } from "../../types/editor";

function normalizeCompareText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

type CandidateEntry = [string, SchemaParam];

function buildFallbackCandidateIndex(previousSchemaParams: SchemaParamMap) {
  const indexes = {
    byFieldAndClass: new Map<string, CandidateEntry[]>(),
    byFieldAndType: new Map<string, CandidateEntry[]>(),
    byAliasAndType: new Map<string, CandidateEntry[]>(),
  };

  Object.entries(previousSchemaParams || {}).forEach(([key, parameter]) => {
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
    indexes.byFieldAndClass.get(fieldAndClassKey)?.push([key, parameter]);

    if (!indexes.byFieldAndType.has(fieldAndTypeKey)) {
      indexes.byFieldAndType.set(fieldAndTypeKey, []);
    }
    indexes.byFieldAndType.get(fieldAndTypeKey)?.push([key, parameter]);

    if (!alias) {
      return;
    }
    if (!indexes.byAliasAndType.has(aliasAndTypeKey)) {
      indexes.byAliasAndType.set(aliasAndTypeKey, []);
    }
    indexes.byAliasAndType.get(aliasAndTypeKey)?.push([key, parameter]);
  });

  return indexes;
}

function getUniqueFallbackMatch(
  parameter: SchemaParam,
  candidateIndex: ReturnType<typeof buildFallbackCandidateIndex>,
  matchedPreviousKeys: Set<string>,
) {
  const field = normalizeCompareText(parameter.field);
  const nodeClass = normalizeCompareText(parameter.nodeClass);
  const type = normalizeCompareText(parameter.type);
  const alias = normalizeCompareText(parameter.name);
  const candidates: CandidateEntry[] = [];

  [
    candidateIndex.byFieldAndClass.get(`${field}|${nodeClass}`),
    candidateIndex.byFieldAndType.get(`${field}|${type}`),
    alias ? candidateIndex.byAliasAndType.get(`${alias}|${type}`) : null,
  ].forEach((entries) => {
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach((entry) => candidates.push(entry));
  });

  const uniqueCandidates: CandidateEntry[] = [];
  const seen = new Set<string>();
  candidates
    .filter(([key]) => !matchedPreviousKeys.has(key))
    .forEach(([key, candidate]) => {
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

function mergeSchemaParam(
  nextParam: SchemaParam,
  previousParam: SchemaParam,
  migrationStatus: string,
  migrationReason = "",
): SchemaParam {
  const merged: SchemaParam = {
    ...nextParam,
    exposed: Boolean(previousParam.exposed),
    name: previousParam.name || nextParam.name,
    type: previousParam.type || nextParam.type,
    required: Boolean(previousParam.required),
    description: previousParam.description || "",
    default: previousParam.default ?? nextParam.default,
    example: previousParam.example ?? nextParam.example,
    choices: Array.isArray(previousParam.choices) ? [...previousParam.choices] : [...(nextParam.choices || [])],
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

export function migrateSchemaParams(previousSchemaParams: SchemaParamMap, nextSchemaParams: SchemaParamMap) {
  const matchedPreviousKeys = new Set<string>();
  const candidateIndex = buildFallbackCandidateIndex(previousSchemaParams);
  const mergedSchemaParams: SchemaParamMap = {};
  const summary: UpgradeSummary = {
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
      summary.matched?.push({ previousKey: key, nextKey: key, status: "retained" });
      return;
    }

    const fallbackMatch = getUniqueFallbackMatch(nextParam, candidateIndex, matchedPreviousKeys);
    if (fallbackMatch) {
      const [previousKey, matchedParam] = fallbackMatch;
      matchedPreviousKeys.add(previousKey);
      mergedSchemaParams[key] = mergeSchemaParam(nextParam, matchedParam, "review", "fallback_match");
      summary.review += 1;
      summary.matched?.push({ previousKey, nextKey: key, status: "review" });
      return;
    }

    mergedSchemaParams[key] = {
      ...nextParam,
      migrationStatus: "new",
      migrationReason: "new_param",
    };
    summary.added += 1;
    summary.addedKeys?.push(key);
  });

  Object.keys(previousSchemaParams || {}).forEach((key) => {
    if (matchedPreviousKeys.has(key)) {
      return;
    }
    summary.removed += 1;
    summary.removedKeys?.push(key);
  });

  return {
    schemaParams: mergedSchemaParams,
    summary,
  };
}
