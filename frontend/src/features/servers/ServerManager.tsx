import { useEffect, useRef, type ChangeEvent } from "react";
import { CustomSelect } from "../../components/ui/CustomSelect";
import { Modal } from "../../components/ui/Modal";
import type { SaveServerPayload, ServerDto } from "../../types/api";

const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";

interface ServerManagerProps {
  title?: string;
  subtitle?: string;
  servers: ServerDto[];
  currentServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onToggleServer: (server: ServerDto, enabled: boolean) => void;
  onDeleteServer: (server: ServerDto) => void;
  onOpenCreate: () => void;
  onOpenEdit: (server: ServerDto) => void;
  modalOpen: boolean;
  modalMode: "add" | "edit";
  form: SaveServerPayload;
  onFormChange: (next: SaveServerPayload) => void;
  onCloseModal: () => void;
  onSubmitModal: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="lucide lucide-pencil"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function ServerManager(props: ServerManagerProps) {
  const currentServer = props.servers.find((server) => server.id === props.currentServerId) || null;
  const currentServerWarning = currentServer?.unsupported
    ? props.t("server_unsupported_reason", { type: currentServer.server_type || "unknown" })
    : "";
  const selectedServerLabel = currentServer?.name || currentServer?.id || "";
  const serverOptions = props.servers.map((server) => ({
    value: server.id,
    label: `${server.name || server.id}${server.unsupported ? ` ${props.t("server_unsupported_short")}` : ""}`,
  }));
  const serverIdInputRef = useRef<HTMLInputElement | null>(null);
  const serverNameInputRef = useRef<HTMLInputElement | null>(null);
  const hasSeededDefaultUrlRef = useRef(false);

  useEffect(() => {
    if (!props.modalOpen) {
      hasSeededDefaultUrlRef.current = false;
      return;
    }
    if (hasSeededDefaultUrlRef.current) {
      return;
    }
    hasSeededDefaultUrlRef.current = true;
    if (props.modalMode === "add" && !props.form.url) {
      props.onFormChange({ ...props.form, url: DEFAULT_COMFYUI_URL });
    }
  }, [props.form, props.modalMode, props.modalOpen, props.onFormChange]);

  function update<K extends keyof SaveServerPayload>(key: K, value: SaveServerPayload[K]) {
    props.onFormChange({ ...props.form, [key]: value });
  }

  function onInputChange<K extends keyof SaveServerPayload>(key: K) {
    return (event: ChangeEvent<HTMLInputElement>) => update(key, event.target.value as SaveServerPayload[K]);
  }

  return (
    <section className="card" aria-labelledby="server-manager-title">
      <div className="section-header panel-toolbar">
        <div className="panel-title-wrap">
          <h2 id="server-manager-title" className="card-title">{props.t("server_manager")}</h2>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-secondary panel-action-btn" onClick={props.onOpenCreate}>
            {props.t("add_server_toggle")}
          </button>
        </div>
      </div>

      {props.servers.length === 0 ? (
        <div className="server-empty-state">
          <p className="section-meta">{props.t("no_servers")}</p>
          <button type="button" className="btn btn-secondary" onClick={props.onOpenCreate}>
            {props.t("create_first_server")}
          </button>
        </div>
      ) : (
        <div className="server-config-container card card-nested">
          <div className="server-main-row">
            <div className="server-main-left">
              <span className="section-meta">{props.t("current_server_title")}</span>
              <div className="server-selector-wrapper">
                {props.servers.length === 1 ? (
                  <div className="server-selector-static" aria-label={props.t("select_server")}>
                    {selectedServerLabel}{currentServer?.unsupported ? ` ${props.t("server_unsupported_short")}` : ""}
                  </div>
                ) : (
                  <CustomSelect
                    value={props.currentServerId || ""}
                    options={serverOptions}
                    ariaLabel={props.t("select_server")}
                    className="is-server-select"
                    onChange={props.onSelectServer}
                  />
                )}
              </div>
              {currentServerWarning ? <p className="form-help">{currentServerWarning}</p> : null}
            </div>

            {currentServer ? (
              <div id="current-server-actions" className="server-header-controls">
                <div className="server-status-toggle">
                  <label className="toggle-inline" title="Enable/Disable Server" style={{ margin: 0 }}>
                    <span className={currentServer.enabled ? "status-on" : "status-off"}>
                      {currentServer.enabled ? props.t("server_enabled") : props.t("server_disabled")}
                    </span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={currentServer.enabled}
                        onChange={(event) => props.onToggleServer(currentServer, event.target.checked)}
                      />
                      <span className="slider" />
                    </div>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon server-action-btn"
                    aria-label={props.t("edit")}
                    onClick={() => props.onOpenEdit(currentServer)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon server-action-btn server-delete-btn"
                    aria-label={props.t("delete")}
                    onClick={() => props.onDeleteServer(currentServer)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Modal
        open={props.modalOpen}
        title={props.modalMode === "edit" ? props.t("edit_server_modal_title") : props.t("add_server_modal_title")}
        onClose={props.onCloseModal}
        initialFocusRef={props.modalMode === "edit" ? serverNameInputRef : serverIdInputRef}
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={props.onCloseModal}>{props.t("cancel")}</button>
            <button type="button" className="btn btn-primary" onClick={props.onSubmitModal}>
              {props.modalMode === "edit" ? props.t("save_server_changes") : props.t("save_and_connect")}
            </button>
          </>
        )}
      >
        <div className="modal-grid">
          <div id="modal-server-id-group" className="form-group form-group-half">
            <label htmlFor="modal-server-id">{props.t("server_id_label")}</label>
            <input
              ref={serverIdInputRef}
              id="modal-server-id"
              type="text"
              className="input-field"
              value={props.form.id ?? ""}
              disabled={props.modalMode === "edit"}
              onChange={onInputChange("id")}
              placeholder={props.t("new_server_id_placeholder")}
              autoComplete="off"
            />
            <p className="form-help">{props.t("server_id_help")}</p>
          </div>
          <div className="form-group form-group-half">
            <label htmlFor="modal-server-name">{props.t("server_name")}</label>
            <input
              ref={serverNameInputRef}
              id="modal-server-name"
              type="text"
              className="input-field"
              value={props.form.name}
              onChange={onInputChange("name")}
              placeholder={props.t("new_server_name_placeholder")}
              autoComplete="off"
            />
            <p className="form-help">{props.t("server_name_help")}</p>
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="modal-server-url">{props.t("server_url_label")}</label>
            <input
              id="modal-server-url"
              type="text"
              className="input-field"
              value={props.form.url}
              onChange={onInputChange("url")}
              placeholder={props.t("new_server_url_placeholder")}
              autoComplete="off"
            />
            <p className="form-help">{props.t("server_url_help_comfyui")}</p>
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="modal-server-output">{props.t("server_output_dir")}</label>
            <input
              id="modal-server-output"
              type="text"
              className="input-field"
              value={props.form.output_dir}
              onChange={onInputChange("output_dir")}
              placeholder="./outputs"
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}
