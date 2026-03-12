import type { SaveServerPayload } from "../types/api";
import type { ServerModalMode, TranslateFn } from "./state";

export function getNormalizedServerPayload(
  serverForm: SaveServerPayload,
  fallbackServerId: string,
) {
  const fallbackName = serverForm.name.trim() || serverForm.id?.trim() || fallbackServerId || "";
  return {
    ...serverForm,
    id: serverForm.id?.trim() || "",
    name: fallbackName,
    url: serverForm.url.trim(),
    output_dir: serverForm.output_dir.trim() || "./outputs",
  };
}

export function validateServerForm(
  serverForm: SaveServerPayload,
  serverModalMode: ServerModalMode,
  t: TranslateFn,
) {
  const normalizedPayload = getNormalizedServerPayload(serverForm, "");
  if (!normalizedPayload.name) {
    return t("err_server_name_required");
  }
  if (!normalizedPayload.url) {
    return t(serverModalMode === "edit" ? "err_server_name_id_url_required" : "err_server_name_url_required");
  }
  return "";
}
