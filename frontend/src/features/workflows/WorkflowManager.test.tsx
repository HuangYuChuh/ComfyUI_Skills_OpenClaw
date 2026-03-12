import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowManager } from "./WorkflowManager";
import type { WorkflowSummaryDto } from "../../types/api";

const messages: Record<string, string> = {
  workflow_manager: "Workflow Manager",
  workflow_count: "{count} workflows",
  workflow_count_filtered: "{visible} of {total} workflows",
  workflow_sort_custom: "Custom",
  workflow_sort_recent: "Recently updated",
  workflow_sort_name_asc: "Name A-Z",
  workflow_sort_name_desc: "Name Z-A",
  workflow_sort_enabled: "Enabled first",
  workflow_search_placeholder: "Search workflows",
  register_new_short: "+ New Workflow",
  workflow_more_actions: "More actions for workflow {id}",
  upload_new_version: "Upload New Version",
  delete: "Delete",
  edit_workflow: "Edit workflow {id}",
  toggle_workflow: "Toggle workflow {id}",
  wf_enabled: "Enabled",
  wf_disabled: "Disabled",
  workflow_drag_handle: "Drag to reorder workflow {id}",
};

function t(key: string, vars?: Record<string, string | number>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, token) => String(vars?.[token] ?? ""));
}

const workflows: WorkflowSummaryDto[] = [
  {
    id: "wf-a",
    server_id: "server-1",
    server_name: "Remote",
    enabled: true,
    description: "First workflow",
    updated_at: 10,
  },
  {
    id: "wf-b",
    server_id: "server-1",
    server_name: "Remote",
    enabled: true,
    description: "Second workflow",
    updated_at: 20,
  },
];

function renderWorkflowManager(overrides: Partial<ComponentProps<typeof WorkflowManager>> = {}) {
  const props: ComponentProps<typeof WorkflowManager> = {
    workflows,
    allWorkflowsForCurrentServer: workflows.length,
    search: "",
    sort: "custom",
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    onCreateWorkflow: vi.fn(),
    onEditWorkflow: vi.fn(),
    onDeleteWorkflow: vi.fn(),
    onToggleWorkflow: vi.fn(),
    onUploadWorkflowVersion: vi.fn(),
    onReorderWorkflows: vi.fn(),
    t,
    ...overrides,
  };

  return {
    ...render(<WorkflowManager {...props} />),
    props,
  };
}

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "all",
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
    getData: vi.fn((type: string) => data.get(type) ?? ""),
  };
}

describe("WorkflowManager", () => {
  it("opens the more menu, closes it on outside click, and triggers upload action", async () => {
    const user = userEvent.setup();
    const { props } = renderWorkflowManager();

    const trigger = screen.getByRole("button", { name: "More actions for workflow wf-a" });
    const menu = trigger.closest(".workflow-more")?.querySelector(".workflow-more-menu") as HTMLElement;

    expect(menu).toHaveClass("hidden");

    await user.click(trigger);
    expect(menu).not.toHaveClass("hidden");

    fireEvent.click(document.body);
    expect(menu).toHaveClass("hidden");

    await user.click(trigger);
    const uploadItem = trigger
      .closest(".workflow-more")
      ?.querySelector('.workflow-more-item[role="menuitem"]') as HTMLElement;
    await user.click(uploadItem);

    expect(props.onUploadWorkflowVersion).toHaveBeenCalledWith(workflows[0]);
    expect(menu).toHaveClass("hidden");
  });

  it("reorders workflows when dragged onto another workflow above the midpoint", () => {
    const { props, container } = renderWorkflowManager();
    const handle = screen.getByRole("button", { name: "Drag to reorder workflow wf-a" });
    const target = container.querySelector('[data-workflow-id="wf-b"]') as HTMLElement;
    const dataTransfer = createDataTransfer();

    Object.defineProperty(target, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        left: 0,
        right: 300,
        bottom: 100,
        width: 300,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.drop(target, { dataTransfer, clientY: 20 });

    expect(props.onReorderWorkflows).toHaveBeenCalledWith("wf-a", "wf-b", false);
  });

  it("disables drag reordering while a search filter is active", () => {
    const { props, container } = renderWorkflowManager({ search: "wf" });
    const handle = screen.getByRole("button", { name: "Drag to reorder workflow wf-a" });
    const target = container.querySelector('[data-workflow-id="wf-b"]') as HTMLElement;
    const dataTransfer = createDataTransfer();

    expect(handle).toHaveClass("is-disabled");
    expect(handle).toHaveProperty("draggable", false);

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.drop(target, { dataTransfer, clientY: 80 });

    expect(props.onReorderWorkflows).not.toHaveBeenCalled();
  });

  it("does not render an empty workflow summary pill when there are no workflows", () => {
    renderWorkflowManager({
      workflows: [],
      allWorkflowsForCurrentServer: 0,
    });

    expect(document.querySelector(".panel-meta")).toBeNull();
  });
});
