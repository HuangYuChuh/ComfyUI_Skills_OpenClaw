import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServerManager } from "./ServerManager";
import type { SaveServerPayload, ServerDto } from "../../types/api";

const messages: Record<string, string> = {
  server_manager: "Server Manager",
  add_server_toggle: "Add Server",
  no_servers: "No servers yet",
  create_first_server: "Create First Server",
  current_server_title: "Current Server",
  select_server: "Select Server",
  server_enabled: "Enabled",
  server_disabled: "Disabled",
  edit: "Edit",
  delete: "Delete",
  edit_server_modal_title: "Edit Server",
  add_server_modal_title: "Add Server",
  cancel: "Cancel",
  save_server_changes: "Save changes",
  save_and_connect: "Save and Connect",
  server_id_label: "Server ID",
  new_server_id_placeholder: "new-server-id",
  server_id_help: "Optional. Leave blank to auto-generate. It cannot be changed later.",
  server_name: "Server Name",
  new_server_name_placeholder: "Local Server",
  server_name_help: "Name is display-only and can be changed later.",
  server_url_label: "Server URL",
  server_unsupported_short: "(Unsupported)",
  server_unsupported_reason: "Server type \"{type}\" is not supported in this branch. Remove or migrate this server before using it.",
  server_url_help_comfyui: "Directly calls the standard ComfyUI endpoints: `/prompt`, `/history/{id}`, and `/view`.",
  new_server_url_placeholder: "http://127.0.0.1:8188",
  server_output_dir: "Output Directory",
};

function t(key: string, vars?: Record<string, string | number>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, token) => String(vars?.[token] ?? ""));
}

const defaultForm: SaveServerPayload = {
  id: "",
  name: "",
  url: "",
  enabled: true,
  output_dir: "./outputs",
};

const serverFixture: ServerDto = {
  id: "local",
  name: "Local",
  url: "http://127.0.0.1:8188",
  enabled: true,
  output_dir: "./outputs",
};

function Harness({
  servers = [],
  modalMode = "add",
  initialForm = defaultForm,
}: {
  servers?: ServerDto[];
  modalMode?: "add" | "edit";
  initialForm?: SaveServerPayload;
}) {
  const [form, setForm] = useState<SaveServerPayload>(initialForm);

  return (
    <ServerManager
      servers={servers}
      currentServerId={servers[0]?.id ?? null}
      onSelectServer={vi.fn()}
      onToggleServer={vi.fn()}
      onDeleteServer={vi.fn()}
      onOpenCreate={vi.fn()}
      onOpenEdit={vi.fn()}
      modalOpen
      modalMode={modalMode}
      form={form}
      onFormChange={setForm}
      onCloseModal={vi.fn()}
      onSubmitModal={vi.fn()}
      t={t}
    />
  );
}

describe("ServerManager", () => {
  it("seeds the default ComfyUI URL for a new server", async () => {
    render(<Harness initialForm={{ ...defaultForm }} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Server URL")).toHaveValue("http://127.0.0.1:8188");
    });
  });

  it("does not reinsert the default URL after the user clears and types a remote URL", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...defaultForm }} />);

    const urlInput = await screen.findByLabelText("Server URL");
    await user.clear(urlInput);
    await user.type(urlInput, "http://10.0.0.1:8188");

    expect(urlInput).toHaveValue("http://10.0.0.1:8188");
  });

  it("focuses the server id field when the add modal opens", async () => {
    render(<Harness initialForm={defaultForm} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Server ID")).toHaveFocus();
    });
  });

  it("focuses the server name field when the edit modal opens", async () => {
    render(
      <Harness
        servers={[serverFixture]}
        modalMode="edit"
        initialForm={{
          ...defaultForm,
          id: serverFixture.id,
          name: serverFixture.name,
          url: serverFixture.url,
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Server Name")).toHaveFocus();
    });
  });

  it("renders static current server text instead of a selector when only one server exists", () => {
    render(<Harness servers={[serverFixture]} modalMode="edit" initialForm={defaultForm} />);

    const serverCard = screen.getByText("Current Server").closest(".server-main-left") as HTMLElement;
    expect(within(serverCard).getByText("Local")).toBeInTheDocument();
    expect(serverCard.querySelector(".server-selector-static")).not.toBeNull();
    expect(within(serverCard).queryByRole("button", { name: "Select Server" })).toBeNull();
  });

  it("does not jump focus back to server id while typing in the server name field", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={defaultForm} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Server ID")).toHaveFocus();
    });

    const serverNameInput = screen.getByLabelText("Server Name");
    await user.click(serverNameInput);
    await user.type(serverNameInput, "Remote Server");

    expect(serverNameInput).toHaveFocus();
    expect(serverNameInput).toHaveValue("Remote Server");
    expect(screen.getByLabelText("Server ID")).toHaveValue("");
  });
});
