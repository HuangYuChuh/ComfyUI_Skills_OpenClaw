import { describe, expect, it } from "vitest";
import { messages } from "./messages";

describe("i18n messages", () => {
  it("keeps the same translation keys across languages", () => {
    const baseKeys = Object.keys(messages.en).sort();

    expect(Object.keys(messages.zh).sort()).toEqual(baseKeys);
    expect(Object.keys(messages.zh_hant).sort()).toEqual(baseKeys);
  });
});
