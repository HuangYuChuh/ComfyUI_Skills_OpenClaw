import { describe, expect, it } from "vitest";
import { reorderWorkflowCollection, restoreWorkflowOrder } from "./workflowOrder";
import type { WorkflowSummaryDto } from "../types/api";

const workflows: WorkflowSummaryDto[] = [
  { id: "a", server_id: "s1", server_name: "S1", enabled: true, description: "", updated_at: 1 },
  { id: "b", server_id: "s1", server_name: "S1", enabled: true, description: "", updated_at: 2 },
  { id: "c", server_id: "s1", server_name: "S1", enabled: false, description: "", updated_at: 3 },
  { id: "x", server_id: "s2", server_name: "S2", enabled: true, description: "", updated_at: 4 },
];

describe("workflowOrder", () => {
  it("reorders only the target server workflows", () => {
    const result = reorderWorkflowCollection(workflows, "s1", "a", "c", true);
    expect(result?.reorderedIds).toEqual(["b", "c", "a"]);
    expect(result?.nextWorkflows.map((workflow) => `${workflow.server_id}:${workflow.id}`)).toEqual([
      "s2:x",
      "s1:b",
      "s1:c",
      "s1:a",
    ]);
  });

  it("restores previous order while preserving the latest workflow objects", () => {
    const current: WorkflowSummaryDto[] = [
      { id: "x", server_id: "s2", server_name: "S2", enabled: true, description: "", updated_at: 4 },
      { id: "c", server_id: "s1", server_name: "S1", enabled: true, description: "changed", updated_at: 30 },
      { id: "b", server_id: "s1", server_name: "S1", enabled: false, description: "latest", updated_at: 20 },
    ];

    const restored = restoreWorkflowOrder(current, "s1", ["a", "b", "c"]);
    expect(restored.map((workflow) => `${workflow.server_id}:${workflow.id}:${workflow.enabled}:${workflow.description}`)).toEqual([
      "s2:x:true:",
      "s1:b:false:latest",
      "s1:c:true:changed",
    ]);
  });
});
