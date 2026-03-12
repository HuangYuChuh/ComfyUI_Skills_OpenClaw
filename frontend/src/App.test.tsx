import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listServersMock,
  addServerMock,
  updateServerMock,
  toggleServerMock,
  deleteServerMock,
  listWorkflowsMock,
  getWorkflowDetailMock,
  saveWorkflowMock,
  toggleWorkflowMock,
  deleteWorkflowMock,
  reorderWorkflowsMock,
  runWorkflowMock,
} = vi.hoisted(() => ({
  listServersMock: vi.fn(),
  addServerMock: vi.fn(),
  updateServerMock: vi.fn(),
  toggleServerMock: vi.fn(),
  deleteServerMock: vi.fn(),
  listWorkflowsMock: vi.fn(),
  getWorkflowDetailMock: vi.fn(),
  saveWorkflowMock: vi.fn(),
  toggleWorkflowMock: vi.fn(),
  deleteWorkflowMock: vi.fn(),
  reorderWorkflowsMock: vi.fn(),
  runWorkflowMock: vi.fn(),
}));

vi.mock("./services/servers", () => ({
  listServers: listServersMock,
  addServer: addServerMock,
  updateServer: updateServerMock,
  toggleServer: toggleServerMock,
  deleteServer: deleteServerMock,
}));

vi.mock("./services/workflows", () => ({
  listWorkflows: listWorkflowsMock,
  getWorkflowDetail: getWorkflowDetailMock,
  saveWorkflow: saveWorkflowMock,
  toggleWorkflow: toggleWorkflowMock,
  deleteWorkflow: deleteWorkflowMock,
  reorderWorkflows: reorderWorkflowsMock,
  runWorkflow: runWorkflowMock,
}));

vi.mock("./lib/pixelBlastBackground", () => ({
  initPixelBlastBackground: vi.fn(() => undefined),
}));

import App from "./App";

const serverFixture = {
  id: "local",
  name: "Local",
  url: "http://127.0.0.1:8188",
  enabled: true,
  output_dir: "./outputs",
};

const unsupportedServerFixture = {
  id: "legacy-remote-v2",
  name: "Legacy Remote",
  url: "http://legacy-remote.invalid:8188",
  enabled: true,
  output_dir: "./outputs",
  server_type: "legacy_remote_v2",
  unsupported: true,
  unsupported_reason: "Server type \"legacy_remote_v2\" is not supported in this branch.",
};

const workflowFixture = {
  id: "wf-a",
  server_id: "local",
  server_name: "Local",
  enabled: true,
  description: "First workflow",
  updated_at: 10,
};

const workflowApiJson = JSON.stringify({
  "1": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "hello world",
    },
  },
});

async function uploadWorkflowFile(fileName = "workflow_api.json", content = workflowApiJson) {
  const fileInput = document.getElementById("file-upload") as HTMLInputElement;
  const file = new File([content], fileName, { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: async () => content,
  });
  const user = userEvent.setup();
  await user.upload(fileInput, file);
}

async function enterEditorWithUploadedWorkflow() {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("button", { name: "+ New Workflow" });
  await user.click(screen.getByRole("button", { name: "+ New Workflow" }));
  await user.type(screen.getByLabelText(/Workflow ID/i), "wf-basic");
  await uploadWorkflowFile();
  await screen.findByText("Parsed Input Node List");

  return user;
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.scrollTo = vi.fn();

    listServersMock.mockResolvedValue({
      servers: [serverFixture],
      default_server: serverFixture.id,
    });
    addServerMock.mockResolvedValue({ status: "ok", server: serverFixture });
    updateServerMock.mockResolvedValue({ status: "ok", server: serverFixture });
    toggleServerMock.mockResolvedValue({ status: "ok", enabled: true });
    deleteServerMock.mockResolvedValue({ status: "ok" });
    listWorkflowsMock.mockResolvedValue({ workflows: [workflowFixture] });
    getWorkflowDetailMock.mockResolvedValue({
      workflow_id: workflowFixture.id,
      server_id: workflowFixture.server_id,
      description: workflowFixture.description,
      enabled: workflowFixture.enabled,
      workflow_data: JSON.parse(workflowApiJson),
      schema_params: {},
    });
    saveWorkflowMock.mockResolvedValue({ status: "ok", workflow_id: "wf-basic" });
    toggleWorkflowMock.mockResolvedValue({ status: "ok", enabled: true });
    deleteWorkflowMock.mockResolvedValue({ status: "ok" });
    reorderWorkflowsMock.mockResolvedValue({ status: "ok", workflow_order: [] });
    runWorkflowMock.mockResolvedValue({ status: "ok", result: { images: [] } });
  });

  it("saves with Ctrl/Cmd+S while editing when no modal is open", async () => {
    await enterEditorWithUploadedWorkflow();

    fireEvent.keyDown(document, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(saveWorkflowMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does not save with Ctrl/Cmd+S while a confirm modal is open", async () => {
    const user = await enterEditorWithUploadedWorkflow();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("You have unsaved changes in the editor. Leave anyway?");

    fireEvent.keyDown(document, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(saveWorkflowMock).not.toHaveBeenCalled();
    });
  });

  it("switches from upload zone to mapping section after a workflow file is uploaded", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "+ New Workflow" });
    await user.click(screen.getByRole("button", { name: "+ New Workflow" }));

    expect(screen.getByText("Drag or click to upload ComfyUI workflow_api.json")).toBeInTheDocument();
    expect(document.getElementById("mapping-section")).toHaveClass("hidden");

    await user.type(screen.getByLabelText(/Workflow ID/i), "wf-basic");
    await uploadWorkflowFile();

    await screen.findByText("Parsed Input Node List");
    expect(screen.queryByText("Drag or click to upload ComfyUI workflow_api.json")).not.toBeInTheDocument();
    expect(document.getElementById("mapping-section")).not.toHaveClass("hidden");
  });

  it("opens workflow actions and triggers upload new version", async () => {
    const user = userEvent.setup();
    render(<App />);

    const trigger = await screen.findByRole("button", { name: "More actions for workflow wf-a" });
    await user.click(trigger);

    const menu = trigger.closest(".workflow-more");
    const uploadItem = within(menu as HTMLElement).getByRole("menuitem", { name: "Upload New Version" });
    await user.click(uploadItem);

    expect(getWorkflowDetailMock).toHaveBeenCalledWith("local", "wf-a");
  });

  it("submits a new server using the plain ComfyUI payload shape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Add Server" });
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    await user.type(screen.getByLabelText("Server ID"), "remote");
    await user.type(screen.getByLabelText("Server Name"), "Remote");

    const urlInput = screen.getByLabelText("Server URL");
    fireEvent.change(urlInput, { target: { value: "http://10.0.0.1:8188" } });

    await user.click(screen.getByRole("button", { name: "Save and Connect" }));

    await waitFor(() => {
      expect(addServerMock).toHaveBeenCalledWith({
        id: "remote",
        name: "Remote",
        url: "http://10.0.0.1:8188",
        enabled: true,
        output_dir: "./outputs",
      });
    });
  });

  it("warns when legacy unsupported servers are loaded and blocks creating workflows on them", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [unsupportedServerFixture],
      default_server: unsupportedServerFixture.id,
    });
    listWorkflowsMock.mockResolvedValue({ workflows: [] });

    render(<App />);

    expect((await screen.findAllByText(/Server type "legacy_remote_v2" is not supported in this branch/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Legacy Remote (Unsupported)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ New Workflow" }));

    expect(screen.getAllByText(/Server type "legacy_remote_v2" is not supported in this branch/).length).toBeGreaterThan(0);
  });
});
