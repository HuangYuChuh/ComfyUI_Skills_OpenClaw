import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./services/http";

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
  listBundledCloudTemplatesMock,
  listOfficialCloudTemplatesMock,
  importCloudTemplateMock,
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
  listBundledCloudTemplatesMock: vi.fn(),
  listOfficialCloudTemplatesMock: vi.fn(),
  importCloudTemplateMock: vi.fn(),
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

vi.mock("./services/cloudTemplates", () => ({
  listBundledCloudTemplates: listBundledCloudTemplatesMock,
  listOfficialCloudTemplates: listOfficialCloudTemplatesMock,
  importCloudTemplate: importCloudTemplateMock,
}));

vi.mock("./lib/pixelBlastBackground", () => ({
  initPixelBlastBackground: vi.fn(() => undefined),
}));

import App from "./App";

const serverFixture = {
  id: "local",
  name: "Local",
  server_type: "comfyui" as const,
  url: "http://127.0.0.1:8188",
  enabled: true,
  output_dir: "./outputs",
};

const cloudServerFixture = {
  id: "cloud",
  name: "Comfy Cloud",
  server_type: "comfy_cloud" as const,
  url: "https://cloud.comfy.org",
  enabled: true,
  output_dir: "./outputs",
  api_key: "cck_test_existing_key",
  has_api_key: true,
};

const workflowApiJson = JSON.stringify({
  "1": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "hello world",
    },
  },
});

const noMappableWorkflowApiJson = JSON.stringify({
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: {
      ckpt_name: ["2", 0],
    },
  },
});

async function enterEditorWithUploadedWorkflow() {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("button", { name: "+ New Workflow" });
  await user.click(screen.getByRole("button", { name: "+ New Workflow" }));
  await user.type(screen.getByLabelText(/Workflow ID/i), "wf-basic");

  const fileInput = document.getElementById("file-upload") as HTMLInputElement;
  const file = new File([workflowApiJson], "workflow_api.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: async () => workflowApiJson,
  });
  await user.upload(fileInput, file);

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
    listWorkflowsMock.mockResolvedValue({ workflows: [] });
    getWorkflowDetailMock.mockResolvedValue(null);
    saveWorkflowMock.mockResolvedValue({ status: "ok", workflow_id: "wf-basic" });
    toggleWorkflowMock.mockResolvedValue({ status: "ok", enabled: true });
    deleteWorkflowMock.mockResolvedValue({ status: "ok" });
    reorderWorkflowsMock.mockResolvedValue({ status: "ok", workflow_order: [] });
    runWorkflowMock.mockResolvedValue({ status: "ok", result: { images: [] } });
    listBundledCloudTemplatesMock.mockResolvedValue({ templates: [] });
    listOfficialCloudTemplatesMock.mockResolvedValue({ templates: [] });
    importCloudTemplateMock.mockResolvedValue({ workflow_id: "wf-basic", suggested_test_args: {} });
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

  it("focuses the confirm action when the leave-editor dialog opens", async () => {
    const user = await enterEditorWithUploadedWorkflow();

    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Leave" })).toHaveFocus();
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

    const fileInput = document.getElementById("file-upload") as HTMLInputElement;
    const file = new File([workflowApiJson], "workflow_api.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: async () => workflowApiJson,
    });
    await user.upload(fileInput, file);

    await screen.findByText("Parsed Input Node List");
    expect(screen.queryByText("Drag or click to upload ComfyUI workflow_api.json")).not.toBeInTheDocument();
    expect(document.getElementById("mapping-section")).not.toHaveClass("hidden");
  });

  it("collapses an expanded parameter config after the param is unexposed", async () => {
    const user = await enterEditorWithUploadedWorkflow();

    await user.click(screen.getByRole("button", { name: "Expose visible" }));

    const configToggle = await screen.findByRole("button", { name: "Toggle parameter config for text" });
    await user.click(configToggle);

    const paramRow = screen.getByText("text").closest(".param-row") as HTMLElement;
    expect(paramRow.querySelector(".param-config.is-expanded")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Unexpose visible" }));

    await waitFor(() => {
      expect(paramRow.querySelector(".param-config.is-expanded")).toBeNull();
      expect(screen.queryByRole("button", { name: "Toggle parameter config for text" })).not.toBeInTheDocument();
    });
  });

  it("imports and try-runs a bundled cloud example workflow", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "text_to_image",
          name: "Text to Image",
          description: "Runnable starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    importCloudTemplateMock.mockResolvedValue({
      status: "ok",
      imported: true,
      workflow_id: "text_to_image",
      origin: "bundled_template",
      source_label: "Bundled Starter",
      tags: ["starter"],
      supports_direct_run: true,
      suggested_test_args: { prompt: "a sunset" },
    });
    runWorkflowMock.mockResolvedValue({
      status: "ok",
      result: { images: ["one.png", "two.png"] },
    });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));

    await screen.findByText("Cloud Example Workflows");
    expect(listBundledCloudTemplatesMock).toHaveBeenCalledWith("cloud");

    await user.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText('Run imported workflow "text_to_image" now with starter parameters?');
    await user.click(screen.getByRole("button", { name: "Try Run" }));

    await waitFor(() => {
      expect(importCloudTemplateMock).toHaveBeenCalledWith({
        server_id: "cloud",
        source: "bundled",
        template_id: "text_to_image",
      });
      expect(runWorkflowMock).toHaveBeenCalledWith("cloud", "text_to_image", { prompt: "a sunset" });
    });

    await screen.findByText((content) => content.includes("Cloud example finished. Downloaded 2 file(s)."));
  });

  it("passes the delete-data checkbox value when confirming server deletion", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Delete" });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByText("Delete server local? Data files will NOT be removed.");
    await user.click(screen.getByRole("checkbox", { name: "Also delete this server's local data in data/" }));

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteServerMock).toHaveBeenCalledWith("local", true);
    });
  });

  it("does not delete a server when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Delete" });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByText("Delete server local? Data files will NOT be removed.");
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(deleteServerMock).not.toHaveBeenCalled();
    });
  });

  it("allows adding a server with a blank name by falling back to the server ID", async () => {
    const user = userEvent.setup();
    addServerMock.mockResolvedValue({
      status: "ok",
      server: {
        ...serverFixture,
        id: "fallback-id",
        name: "fallback-id",
      },
    });

    render(<App />);

    await screen.findByRole("button", { name: "Add Server" });
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    const serverIdInput = screen.getByRole("textbox", { name: "Server ID" });
    const serverUrlInput = screen.getByRole("textbox", { name: "Server URL" });

    fireEvent.change(serverIdInput, { target: { value: "fallback-id" } });
    fireEvent.change(serverUrlInput, { target: { value: "http://127.0.0.1:9000" } });
    await user.click(screen.getByRole("button", { name: "Save and Connect" }));

    await waitFor(() => {
      expect(addServerMock).toHaveBeenCalledWith(expect.objectContaining({
        id: "fallback-id",
        name: "fallback-id",
        url: "http://127.0.0.1:9000",
      }));
    });
  });

  it("blocks editing a server when the URL is cleared", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Edit" });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const urlInput = screen.getByLabelText("Server URL");
    await user.clear(urlInput);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(updateServerMock).not.toHaveBeenCalled();
    await screen.findByText("Server ID, name, and URL are required.");
  });

  it("echoes the existing Cloud API key when editing a cloud server", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });

    render(<App />);

    await screen.findByRole("button", { name: "Edit" });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Cloud API Key")).toHaveValue("cck_test_existing_key");
  });

  it("shows the base empty mapping state when an uploaded workflow has no mappable params", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "+ New Workflow" });
    await user.click(screen.getByRole("button", { name: "+ New Workflow" }));
    await user.type(screen.getByLabelText(/Workflow ID/i), "wf-empty");

    const fileInput = document.getElementById("file-upload") as HTMLInputElement;
    const file = new File([noMappableWorkflowApiJson], "workflow_api.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: async () => noMappableWorkflowApiJson,
    });
    await user.upload(fileInput, file);

    await screen.findByText("Parsed Input Node List");
    expect(screen.getByText("Upload a workflow JSON to start mapping parameters.")).toBeInTheDocument();
    expect(screen.queryByText("No parameters matched current filters.")).not.toBeInTheDocument();
  });

  it("retries cloud template import with overwrite_existing after a conflict", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "text_to_image",
          name: "Text to Image",
          description: "Runnable starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    importCloudTemplateMock
      .mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }))
      .mockResolvedValueOnce({
        status: "ok",
        imported: true,
        workflow_id: "text_to_image",
        origin: "bundled_template",
        source_label: "Bundled Starter",
        tags: ["starter"],
        supports_direct_run: true,
        suggested_test_args: {},
      });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await screen.findByText("Cloud Example Workflows");

    await user.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText('Workflow ID "text_to_image" already exists. Overwrite it?');
    await user.click(screen.getByRole("button", { name: "Overwrite" }));

    await waitFor(() => {
      expect(importCloudTemplateMock).toHaveBeenNthCalledWith(1, {
        server_id: "cloud",
        source: "bundled",
        template_id: "text_to_image",
      });
      expect(importCloudTemplateMock).toHaveBeenNthCalledWith(2, {
        server_id: "cloud",
        source: "bundled",
        template_id: "text_to_image",
        overwrite_existing: true,
      });
    });
  });

  it("does not retry cloud template import when overwrite is cancelled", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "text_to_image",
          name: "Text to Image",
          description: "Runnable starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    importCloudTemplateMock.mockRejectedValueOnce(new ApiError("Conflict", { status: 409 }));

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await screen.findByText("Cloud Example Workflows");

    await user.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText('Workflow ID "text_to_image" already exists. Overwrite it?');
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(importCloudTemplateMock).toHaveBeenCalledTimes(1);
      expect(importCloudTemplateMock).toHaveBeenCalledWith({
        server_id: "cloud",
        source: "bundled",
        template_id: "text_to_image",
      });
    });
  });

  it("reloads cloud templates when switching from bundled to official source", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "bundled_template",
          name: "Bundled Template",
          description: "Bundled starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    listOfficialCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "official_template",
          name: "Official Template",
          description: "Official blueprint",
          tags: ["official"],
          origin: "cloud_template",
          source_label: "Comfy Cloud Blueprint",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: false,
          installed: false,
        },
      ],
    });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));

    await screen.findByText("Bundled Template");
    expect(listBundledCloudTemplatesMock).toHaveBeenCalledWith("cloud");

    await user.click(screen.getByRole("button", { name: "Official" }));

    await waitFor(() => {
      expect(listOfficialCloudTemplatesMock).toHaveBeenCalledWith("cloud");
    });
    await screen.findByText("Official Template");
    expect(screen.queryByText("Bundled Template")).not.toBeInTheDocument();
  });

  it("runs an installed official cloud template with default schema arguments", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({ templates: [] });
    listOfficialCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "official_template",
          name: "Official Template",
          description: "Ready to run",
          tags: ["official"],
          origin: "cloud_template",
          source_label: "Comfy Cloud Blueprint",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: false,
          installed: true,
          installed_workflow_id: "wf-official",
        },
      ],
    });
    getWorkflowDetailMock.mockResolvedValue({
      workflow_id: "wf-official",
      server_id: "cloud",
      description: "Installed workflow",
      enabled: true,
      workflow_data: {},
      schema_params: {
        prompt: { default: "a mountain" },
        seed: { default: 42 },
        ignored: { type: "string" },
      },
    });
    runWorkflowMock.mockResolvedValue({
      status: "ok",
      result: { images: ["result.png"] },
    });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await user.click(screen.getByRole("button", { name: "Official" }));

    await screen.findByText("Official Template");
    await user.click(screen.getByRole("button", { name: "Try Run" }));

    await waitFor(() => {
      expect(getWorkflowDetailMock).toHaveBeenCalledWith("cloud", "wf-official");
      expect(runWorkflowMock).toHaveBeenCalledWith("cloud", "wf-official", {
        prompt: "a mountain",
        seed: 42,
      });
    });
  });

  it("shows an error toast when try-run of an installed cloud template fails", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({ templates: [] });
    listOfficialCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "official_template",
          name: "Official Template",
          description: "Ready to run",
          tags: ["official"],
          origin: "cloud_template",
          source_label: "Comfy Cloud Blueprint",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: false,
          installed: true,
          installed_workflow_id: "wf-official",
        },
      ],
    });
    getWorkflowDetailMock.mockResolvedValue({
      workflow_id: "wf-official",
      server_id: "cloud",
      description: "Installed workflow",
      enabled: true,
      workflow_data: {},
      schema_params: {
        prompt: { default: "a mountain" },
      },
    });
    runWorkflowMock.mockRejectedValue(new Error("Run failed"));

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await user.click(screen.getByRole("button", { name: "Official" }));

    await screen.findByText("Official Template");
    await user.click(screen.getByRole("button", { name: "Try Run" }));

    await screen.findByText("Run failed");
  });

  it("hides the cloud examples entry for non-cloud servers", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "+ New Workflow" });
    expect(screen.queryByRole("button", { name: "Cloud Examples" })).not.toBeInTheDocument();
  });

  it("shows an empty state when no cloud templates are available", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({ templates: [] });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));

    await screen.findByText("Cloud Example Workflows");
    await screen.findByText("No Cloud templates available.");
  });

  it("shows an empty state after switching to official templates with no results", async () => {
    const user = userEvent.setup();
    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "bundled_template",
          name: "Bundled Template",
          description: "Bundled starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    listOfficialCloudTemplatesMock.mockResolvedValue({ templates: [] });

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await screen.findByText("Bundled Template");

    await user.click(screen.getByRole("button", { name: "Official" }));

    await screen.findByText("No Cloud templates available.");
    expect(screen.queryByText("Bundled Template")).not.toBeInTheDocument();
  });

  it("shows a loading state while switching to official templates", async () => {
    const user = userEvent.setup();
    let resolveOfficialTemplates: ((value: { templates: Array<Record<string, unknown>> }) => void) | null = null;

    listServersMock.mockResolvedValue({
      servers: [cloudServerFixture],
      default_server: cloudServerFixture.id,
    });
    listBundledCloudTemplatesMock.mockResolvedValue({
      templates: [
        {
          id: "bundled_template",
          name: "Bundled Template",
          description: "Bundled starter",
          tags: ["starter"],
          origin: "bundled_template",
          source_label: "Bundled Starter",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: true,
          installed: false,
        },
      ],
    });
    listOfficialCloudTemplatesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOfficialTemplates = resolve;
        }),
    );

    render(<App />);

    await screen.findByRole("button", { name: "Cloud Examples" });
    await user.click(screen.getByRole("button", { name: "Cloud Examples" }));
    await screen.findByText("Bundled Template");

    await user.click(screen.getByRole("button", { name: "Official" }));

    const dialogs = screen.getAllByRole("dialog");
    const dialog = dialogs[dialogs.length - 1] as HTMLElement;
    expect(within(dialog).getAllByText("Loading...").length).toBeGreaterThan(0);

    resolveOfficialTemplates?.({
      templates: [
        {
          id: "official_template",
          name: "Official Template",
          description: "Official blueprint",
          tags: ["official"],
          origin: "cloud_template",
          source_label: "Comfy Cloud Blueprint",
          server_type_hint: "comfy_cloud",
          supports_direct_run: true,
          default_install: false,
          installed: false,
        },
      ],
    });

    await screen.findByText("Official Template");
  });
});
