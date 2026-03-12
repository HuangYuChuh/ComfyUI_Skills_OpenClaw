import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CloudTemplatesModal } from "./CloudTemplatesModal";

describe("CloudTemplatesModal", () => {
  it("renders source labels and import button states", () => {
    render(
      <CloudTemplatesModal
        open
        source="official"
        templates={[
          {
            id: "text_to_image",
            name: "Text to Image",
            description: "Official template",
            tags: ["official"],
            origin: "cloud_template",
            source_label: "Comfy Cloud Blueprint",
            server_type_hint: "comfy_cloud",
            supports_direct_run: true,
            default_install: false,
            installed: false,
          },
        ]}
        loading={false}
        summary="1 template"
        onClose={vi.fn()}
        onChangeSource={vi.fn()}
        onImport={vi.fn()}
        onTryRun={vi.fn()}
        t={(key) => key}
      />,
    );

    expect(screen.getByText("Text to Image")).toBeInTheDocument();
    expect(screen.getByText("Comfy Cloud Blueprint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cloud_templates_import" })).toBeEnabled();
  });

  it("shows blueprint-only and installed states, and exposes try-run for installed workflows", async () => {
    const user = userEvent.setup();
    const onTryRun = vi.fn();

    render(
      <CloudTemplatesModal
        open
        source="official"
        templates={[
          {
            id: "blueprint",
            name: "Blueprint Only",
            description: "Needs local packaging first",
            tags: [],
            origin: "cloud_template",
            source_label: "Official",
            server_type_hint: "comfy_cloud",
            supports_direct_run: false,
            default_install: false,
            installed: false,
          },
          {
            id: "installed",
            name: "Installed Template",
            description: "Ready to run",
            tags: [],
            origin: "cloud_template",
            source_label: "Official",
            server_type_hint: "comfy_cloud",
            supports_direct_run: true,
            default_install: false,
            installed: true,
            installed_workflow_id: "wf-installed",
          },
        ]}
        loading={false}
        summary="2 templates"
        onClose={vi.fn()}
        onChangeSource={vi.fn()}
        onImport={vi.fn()}
        onTryRun={onTryRun}
        t={(key) => key}
      />,
    );

    expect(screen.getByRole("button", { name: "cloud_templates_blueprint_only" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cloud_templates_imported" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "cloud_templates_try_run" }));
    expect(onTryRun).toHaveBeenCalledWith("wf-installed");
  });
});
