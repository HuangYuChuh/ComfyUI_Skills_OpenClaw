import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { safeReadLocalStorage, safeWriteLocalStorage } from "../lib/storage";
import { addServer, deleteServer, listServers, toggleServer, updateServer } from "../services/servers";
import type { SaveServerPayload, ServerDto } from "../types/api";
import type { ConfirmState, ServerModalMode, TranslateFn } from "./state";
import { defaultServerForm } from "./state";
import { getNormalizedServerPayload, validateServerForm } from "./serverUtils";

interface UseServerManagementArgs {
  t: TranslateFn;
  pushToast: (type: "success" | "error" | "info", message: string) => void;
  refreshWorkflows: () => Promise<void>;
  setConfirmState: Dispatch<SetStateAction<ConfirmState>>;
}

export function useServerManagement(args: UseServerManagementArgs) {
  const [servers, setServers] = useState<ServerDto[]>([]);
  const [defaultServerId, setDefaultServerId] = useState<string | null>(null);
  const [currentServerId, setCurrentServerIdState] = useState<string | null>(() => safeReadLocalStorage("ui-server"));
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverModalMode, setServerModalMode] = useState<ServerModalMode>("add");
  const [serverForm, setServerForm] = useState<SaveServerPayload>(defaultServerForm());
  const warnedUnsupportedServerIdsRef = useRef<Set<string>>(new Set());

  function setCurrentServerId(serverId: string) {
    setCurrentServerIdState(serverId);
    safeWriteLocalStorage("ui-server", serverId);
  }

  async function loadInitialServers() {
    const data = await listServers();
    const nextServers = data.servers || [];
    const supportedServers = nextServers.filter((server) => !server.unsupported);
    const preferredServerId = currentServerId && nextServers.some((server) => server.id === currentServerId)
      ? currentServerId
      : (data.default_server || nextServers[0]?.id || null);
    const preferredServer = nextServers.find((server) => server.id === preferredServerId) || null;
    const nextServerId = preferredServer?.unsupported ? (supportedServers[0]?.id || preferredServerId) : preferredServerId;

    nextServers.filter((server) => server.unsupported).forEach((server) => {
      if (warnedUnsupportedServerIdsRef.current.has(server.id)) {
        return;
      }
      warnedUnsupportedServerIdsRef.current.add(server.id);
      args.pushToast("info", args.t("server_unsupported_reason", { type: server.server_type || "unknown" }));
    });

    setServers(nextServers);
    setDefaultServerId(data.default_server || null);
    setCurrentServerIdState(nextServerId);
    if (nextServerId) {
      safeWriteLocalStorage("ui-server", nextServerId);
    }
  }

  function handleAddServer() {
    setServerModalMode("add");
    setServerForm(defaultServerForm());
    setServerModalOpen(true);
  }

  function handleEditServer(server: ServerDto) {
    setServerModalMode("edit");
    setServerForm({ id: server.id, name: server.name, url: server.url, enabled: server.enabled, output_dir: server.output_dir });
    setServerModalOpen(true);
  }

  async function handleSubmitServerModal() {
    const errorMessage = validateServerForm(serverForm, serverModalMode, args.t);
    if (errorMessage) {
      args.pushToast("error", errorMessage);
      return;
    }

    const normalizedPayload = getNormalizedServerPayload(serverForm, currentServerId || "");
    try {
      if (serverModalMode === "add") {
        const created = await addServer(normalizedPayload);
        await loadInitialServers();
        await args.refreshWorkflows();
        setCurrentServerId(created.server.id);
        args.pushToast("success", args.t("ok_add_server"));
      } else if (currentServerId) {
        await updateServer(currentServerId, normalizedPayload);
        await loadInitialServers();
        await args.refreshWorkflows();
        args.pushToast("success", args.t("ok_save_cfg"));
      }
      setServerModalOpen(false);
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_add_server"));
    }
  }

  async function handleToggleServer(server: ServerDto, enabled: boolean) {
    try {
      await toggleServer(server.id, { enabled });
      await loadInitialServers();
      await args.refreshWorkflows();
      args.pushToast("success", args.t(enabled ? "ok_toggle_server_enabled" : "ok_toggle_server_disabled", { id: server.name || server.id }));
    } catch (error) {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_toggle_server"));
    }
  }

  function requestDeleteServer(server: ServerDto) {
    args.setConfirmState({
      open: true,
      title: args.t("confirm_action_title"),
      message: args.t("del_server_confirm", { id: server.id }),
      confirmLabel: args.t("delete"),
      cancelLabel: args.t("cancel"),
      tone: "danger",
      checkboxLabel: args.t("delete_server_data_checkbox"),
      checkboxChecked: false,
      onResolve: async (confirmed, checked) => {
        if (!confirmed) {
          return;
        }
        try {
          await deleteServer(server.id, checked);
          await loadInitialServers();
          await args.refreshWorkflows();
          args.pushToast("success", args.t(checked ? "ok_del_server_with_data" : "ok_del_server_keep_data"));
        } catch (error) {
          args.pushToast("error", error instanceof Error ? error.message : args.t("err_del_server"));
        }
      },
    });
  }

  return {
    servers,
    defaultServerId,
    currentServerId,
    serverModalOpen,
    serverModalMode,
    serverForm,
    setServerForm,
    setServerModalOpen,
    setCurrentServerId,
    loadInitialServers,
    handleAddServer,
    handleEditServer,
    handleSubmitServerModal,
    handleToggleServer,
    requestDeleteServer,
  };
}
