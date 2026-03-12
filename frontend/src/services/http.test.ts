import { describe, expect, it, vi } from "vitest";
import { requestJson } from "./http";

describe("requestJson", () => {
  it("parses validation errors into a single message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      detail: [
        { msg: "Server name is required" },
        { msg: "URL is required" },
      ],
    }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(requestJson("/api/test")).rejects.toEqual(expect.objectContaining({
      message: "Server name is required; URL is required",
      status: 422,
    }));
  });
});
