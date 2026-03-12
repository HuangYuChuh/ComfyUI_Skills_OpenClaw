import { messages } from "./messages";

export type Language = "en" | "zh" | "zh_hant";

export function normalizeLanguage(language?: string | null): Language {
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

export function translate(language: Language, key: string, vars: Record<string, string | number> = {}) {
  let text = messages[language]?.[key] ?? messages.en[key] ?? key;
  for (const [variable, value] of Object.entries(vars)) {
    text = text.replace(`{${variable}}`, String(value));
  }
  return text;
}
