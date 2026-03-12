import type { SaveServerPayload, ServerDto, TogglePayload } from "../types/api";
import { requestJson } from "./http";

export interface ServersResponse {
  servers: ServerDto[];
  default_server: string | null;
}

export function listServers() {
  return requestJson<ServersResponse>("/api/servers");
}

export function addServer(payload: SaveServerPayload) {
  return requestJson<{ status: string; server: ServerDto }>("/api/servers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateServer(serverId: string, payload: SaveServerPayload) {
  return requestJson<{ status: string; server: ServerDto }>(`/api/servers/${encodeURIComponent(serverId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function toggleServer(serverId: string, payload: TogglePayload) {
  return requestJson<{ status: string; enabled: boolean }>(`/api/servers/${encodeURIComponent(serverId)}/toggle`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteServer(serverId: string, deleteData: boolean) {
  return requestJson<{ status: string }>(`/api/servers/${encodeURIComponent(serverId)}?delete_data=${deleteData ? "true" : "false"}`, {
    method: "DELETE",
  });
}
