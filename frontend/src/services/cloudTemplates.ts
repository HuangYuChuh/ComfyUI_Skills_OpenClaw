import type { CloudTemplateImportResponseDto, CloudTemplateSummaryDto } from "../types/api";
import { requestJson } from "./http";

export function listBundledCloudTemplates(serverId?: string | null) {
  const query = serverId ? `?server_id=${encodeURIComponent(serverId)}` : "";
  return requestJson<{ templates: CloudTemplateSummaryDto[] }>(`/api/cloud/templates/bundled${query}`);
}

export function listOfficialCloudTemplates(serverId?: string | null) {
  const query = serverId ? `?server_id=${encodeURIComponent(serverId)}` : "";
  return requestJson<{ templates: CloudTemplateSummaryDto[] }>(`/api/cloud/templates/official${query}`);
}

export function importCloudTemplate(payload: {
  server_id: string;
  source: "bundled" | "official";
  template_id: string;
  workflow_id?: string | null;
  overwrite_existing?: boolean;
}) {
  return requestJson<CloudTemplateImportResponseDto>("/api/cloud/templates/import", {
    method: "POST",
    body: JSON.stringify({
      overwrite_existing: false,
      ...payload,
    }),
  });
}
