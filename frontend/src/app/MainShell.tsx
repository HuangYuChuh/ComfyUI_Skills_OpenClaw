import { CustomSelect } from "../components/ui/CustomSelect";
import { ServerManager } from "../features/servers/ServerManager";
import { WorkflowManager } from "../features/workflows/WorkflowManager";
import type { SaveServerPayload, ServerDto, WorkflowSummaryDto } from "../types/api";
import type { Language } from "../i18n";
import type { ServerModalMode, TranslateFn } from "./state";

interface MainShellProps {
  language: Language;
  setLanguage: (language: Language) => void;
  servers: ServerDto[];
  currentServer: ServerDto | null;
  visibleWorkflows: WorkflowSummaryDto[];
  currentServerWorkflowsCount: number;
  serverModalOpen: boolean;
  serverModalMode: ServerModalMode;
  serverForm: SaveServerPayload;
  workflowSearch: string;
  workflowSort: string;
  onSelectServer: (serverId: string) => void;
  onToggleServer: (server: ServerDto, enabled: boolean) => void;
  onDeleteServer: (server: ServerDto) => void;
  onOpenCreateServer: () => void;
  onOpenEditServer: (server: ServerDto) => void;
  onServerFormChange: (next: SaveServerPayload) => void;
  onCloseServerModal: () => void;
  onSubmitServerModal: () => void;
  onWorkflowSearchChange: (value: string) => void;
  onWorkflowSortChange: (value: string) => void;
  onCreateWorkflow: () => void;
  onEditWorkflow: (workflow: WorkflowSummaryDto) => void;
  onDeleteWorkflow: (workflow: WorkflowSummaryDto) => void;
  onToggleWorkflow: (workflow: WorkflowSummaryDto, enabled: boolean) => void;
  onUploadWorkflowVersion: (workflow: WorkflowSummaryDto) => void;
  onReorderWorkflows: (sourceWorkflowId: string, targetWorkflowId: string, placeAfter: boolean) => void;
  t: TranslateFn;
}

export function MainShell(props: MainShellProps) {
  return (
    <main className="page shell">
      <header className="page-header">
        <div className="logo-frame" aria-hidden="true">
          <img className="logo-image" src="/static/logo.png" alt="ComfyUI OpenClaw logo" />
        </div>
        <div className="page-title-group">
          <h1>{props.t("title")}</h1>
          <p className="subtitle">{props.t("subtitle")}</p>
        </div>
        <CustomSelect
          value={props.language}
          options={[
            { value: "en", label: "English" },
            { value: "zh", label: "简体中文" },
            { value: "zh_hant", label: "繁體中文" },
          ]}
          onChange={(value) => props.setLanguage(value as Language)}
          ariaLabel="Language selector"
          className="is-lang-select"
        />
      </header>

      <ServerManager
        servers={props.servers}
        currentServerId={props.currentServer?.id || null}
        onSelectServer={props.onSelectServer}
        onToggleServer={props.onToggleServer}
        onDeleteServer={props.onDeleteServer}
        onOpenCreate={props.onOpenCreateServer}
        onOpenEdit={props.onOpenEditServer}
        modalOpen={props.serverModalOpen}
        modalMode={props.serverModalMode}
        form={props.serverForm}
        onFormChange={props.onServerFormChange}
        onCloseModal={props.onCloseServerModal}
        onSubmitModal={props.onSubmitServerModal}
        t={props.t}
      />

      <WorkflowManager
        workflows={props.visibleWorkflows}
        allWorkflowsForCurrentServer={props.currentServerWorkflowsCount}
        search={props.workflowSearch}
        sort={props.workflowSort}
        onSearchChange={props.onWorkflowSearchChange}
        onSortChange={props.onWorkflowSortChange}
        onCreateWorkflow={props.onCreateWorkflow}
        onEditWorkflow={props.onEditWorkflow}
        onDeleteWorkflow={props.onDeleteWorkflow}
        onToggleWorkflow={props.onToggleWorkflow}
        onUploadWorkflowVersion={props.onUploadWorkflowVersion}
        onReorderWorkflows={props.onReorderWorkflows}
        t={props.t}
      />
    </main>
  );
}
