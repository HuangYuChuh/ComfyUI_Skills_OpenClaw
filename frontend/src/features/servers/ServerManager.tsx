import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CustomSelect } from "../../components/ui/CustomSelect";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { Modal } from "../../components/ui/Modal";
import type { SaveServerPayload, ServerDto, ServerType } from "../../types/api";

const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
const DEFAULT_COMFY_CLOUD_URL = "https://cloud.comfy.org";

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
  canKeepApiKey: boolean;
  onFormChange: (next: SaveServerPayload) => void;
  onCloseModal: () => void;
  onSubmitModal: () => void;
  t: (key: string) => string;
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

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M10.733 5.076A10.744 10.744 0 0 1 12 5c4.642 0 8.73 2.945 9.938 7a10.523 10.523 0 0 1-4.32 5.568" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.75 10.75 0 0 1 12 19c-4.642 0-8.73-2.945-9.938-7a10.525 10.525 0 0 1 4.446-5.633" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export function ServerManager(props: ServerManagerProps) {
  const currentServer = props.servers.find((server) => server.id === props.currentServerId) || null;
  const selectedServerLabel = currentServer?.name || currentServer?.id || "";
  const serverOptions = props.servers.map((server) => ({
    value: server.id,
    label: server.name || server.id,
  }));
  const serverIdInputRef = useRef<HTMLInputElement | null>(null);
  const serverNameInputRef = useRef<HTMLInputElement | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setShowApiKey(false);
  }, [props.modalOpen, props.form.id, props.form.server_type]);

  function update<K extends keyof SaveServerPayload>(key: K, value: SaveServerPayload[K]) {
    props.onFormChange({ ...props.form, [key]: value });
  }

  function onServerTypeChange(value: string) {
    const serverType = value as ServerType;
    const nextForm = { ...props.form, server_type: serverType };
    if (serverType === "comfy_cloud") {
      nextForm.url = DEFAULT_COMFY_CLOUD_URL;
    } else if (props.form.server_type === "comfy_cloud" && (!nextForm.url || nextForm.url === DEFAULT_COMFY_CLOUD_URL)) {
      nextForm.url = DEFAULT_COMFYUI_URL;
    }
    props.onFormChange(nextForm);
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
                    {selectedServerLabel}
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
            <label htmlFor="modal-server-type">{props.t("select_server")}</label>
            <CustomSelect
              value={props.form.server_type}
              options={[
                { value: "comfyui", label: props.t("server_type_comfyui") },
                { value: "comfy_cloud", label: props.t("server_type_comfy_cloud") },
              ]}
              ariaLabel={props.t("select_server")}
              className="is-server-select"
              onChange={onServerTypeChange}
            />
          </div>
          <div className="form-group form-group-full">
            <label htmlFor="modal-server-url">
              {props.form.server_type === "comfy_cloud" ? props.t("cloud_base_url_label") : props.t("server_url_label")}
            </label>
            <input
              id="modal-server-url"
              type="text"
              className="input-field"
              value={props.form.url}
              onChange={onInputChange("url")}
              placeholder={props.form.server_type === "comfy_cloud" ? props.t("cloud_base_url_placeholder") : props.t("new_server_url_placeholder")}
              autoComplete="off"
            />
          </div>

          {props.form.server_type === "comfy_cloud" ? (
            <>
              <div className="form-group form-group-full">
                <div className="label-with-help">
                  <label htmlFor="modal-server-api-key">{props.t("cloud_api_key_label")}</label>
                  <InfoTooltip
                    label={props.t("cloud_api_key_apply_tooltip_label")}
                    content={props.t("cloud_api_key_apply_tooltip")}
                  />
                </div>
                <div className="input-action-group">
                  <input
                    id="modal-server-api-key"
                    type={showApiKey ? "text" : "password"}
                    className="input-field input-field-with-action"
                    value={props.form.api_key}
                    onChange={onInputChange("api_key")}
                    placeholder={props.canKeepApiKey ? `${props.t("cloud_api_key_placeholder")} (${props.t("save_anyway")})` : props.t("cloud_api_key_placeholder")}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon small input-action-btn"
                    aria-label={showApiKey ? props.t("cloud_api_key_hide") : props.t("cloud_api_key_show")}
                    aria-pressed={showApiKey}
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="form-help">{props.t("cloud_api_key_help")}</p>
              </div>
              <div className="form-group form-group-full">
                <label htmlFor="modal-server-api-key-env">{props.t("cloud_api_key_env_label")}</label>
                <input
                  id="modal-server-api-key-env"
                  type="text"
                  className="input-field"
                  value={props.form.api_key_env}
                  onChange={onInputChange("api_key_env")}
                  placeholder={props.t("cloud_api_key_env_placeholder")}
                  autoComplete="off"
                />
                <p className="form-help">{props.t("cloud_api_key_env_help")}</p>
              </div>
              <div className="form-group form-group-full">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={props.form.use_api_key_for_partner_nodes}
                    onChange={(event) => update("use_api_key_for_partner_nodes", event.target.checked)}
                  />
                  <span>{props.t("cloud_partner_key_toggle")}</span>
                </label>
                <p className="form-help">{props.t("cloud_call_scheme_help")}</p>
              </div>
            </>
          ) : null}

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
