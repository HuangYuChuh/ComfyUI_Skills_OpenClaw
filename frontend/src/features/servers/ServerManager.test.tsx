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
  server_type_comfyui: "ComfyUI",
  server_type_comfy_cloud: "Comfy Cloud",
  cloud_base_url_label: "Cloud API Base URL",
  server_url_label: "Server URL",
  cloud_base_url_placeholder: "https://cloud.comfy.org",
  new_server_url_placeholder: "http://127.0.0.1:8188",
  cloud_api_key_label: "Cloud API Key",
  cloud_api_key_placeholder: "cck_xxx",
  cloud_api_key_help: "Use the same API key as the Cloud API.",
  cloud_api_key_apply_tooltip_label: "How to get a Cloud API key",
  cloud_api_key_apply_tooltip: "Create it at https://platform.comfy.org/login: sign in, open API Keys, click + New, enter a name, then Generate. Save it immediately because the key is shown only once.",
  cloud_api_key_show: "Show API key",
  cloud_api_key_hide: "Hide API key",
  cloud_api_key_env_label: "Cloud API Key Env",
  cloud_api_key_env_placeholder: "COMFY_CLOUD_API_KEY",
  cloud_api_key_env_help: "Optional environment variable name for runtime injection.",
  cloud_partner_key_toggle: "Also forward this API key to `extra_data.api_key_comfy_org` for partner nodes",
  cloud_call_scheme_help: "Call flow: `POST /api/prompt` -> `GET /api/job/{id}/status` -> `GET /api/history_v2/{id}` -> `GET /api/view`.",
  server_output_dir: "Output Directory",
  save_anyway: "Save anyway",
};

function t(key: string) {
  return messages[key] ?? key;
}

const defaultForm: SaveServerPayload = {
  id: "",
  name: "",
  server_type: "comfyui",
  url: "",
  enabled: true,
  output_dir: "./outputs",
  api_key: "",
  api_key_env: "",
  use_api_key_for_partner_nodes: false,
};

const serverFixture: ServerDto = {
  id: "local",
  name: "Local",
  server_type: "comfyui",
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
      canKeepApiKey={false}
      onFormChange={setForm}
      onCloseModal={vi.fn()}
      onSubmitModal={vi.fn()}
      t={t}
    />
  );
}

describe("ServerManager", () => {
  it("switches the modal to Comfy Cloud fields and seeds the default cloud URL", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...defaultForm, url: "http://127.0.0.1:8188" }} />);

    await user.click(screen.getByRole("button", { name: "Select Server" }));
    await user.click(screen.getByRole("option", { name: "Comfy Cloud" }));

    expect(screen.getByLabelText("Cloud API Base URL")).toHaveValue("https://cloud.comfy.org");
    expect(screen.getByLabelText("Cloud API Key")).toBeInTheDocument();
    expect(screen.getByText("Also forward this API key to `extra_data.api_key_comfy_org` for partner nodes")).toBeInTheDocument();
  });

  it("shows the Cloud API key application tip on hover", async () => {
    const user = userEvent.setup();
    render(<Harness initialForm={{ ...defaultForm, server_type: "comfy_cloud", url: "https://cloud.comfy.org" }} />);

    await user.hover(screen.getByRole("button", { name: "How to get a Cloud API key" }));

    expect(
      screen.getByRole("tooltip", {
        name: /Create it at https:\/\/platform\.comfy\.org\/login/i,
      }),
    ).toBeInTheDocument();
  });

  it("masks the existing Cloud API key by default and reveals it on demand", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialForm={{
          ...defaultForm,
          server_type: "comfy_cloud",
          url: "https://cloud.comfy.org",
          api_key: "cck_existing_secret",
        }}
      />,
    );

    const apiKeyInput = screen.getByLabelText("Cloud API Key");
    expect(apiKeyInput).toHaveValue("cck_existing_secret");
    expect(apiKeyInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show API key" }));

    expect(apiKeyInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide API key" })).toBeInTheDocument();
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
    await user.type(serverNameInput, "Cloud Server");

    expect(serverNameInput).toHaveFocus();
    expect(serverNameInput).toHaveValue("Cloud Server");
    expect(screen.getByLabelText("Server ID")).toHaveValue("");
  });
});
