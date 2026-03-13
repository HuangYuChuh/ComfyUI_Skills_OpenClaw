import type {
  TransferExportBuildResponseDto,
  TransferExportPreviewDto,
  TransferImportPreviewDto,
  TransferImportResponseDto,
  TransferSelectionPayload,
} from "../types/api";
import { requestJson } from "./http";

export function previewTransferExport() {
  return requestJson<TransferExportPreviewDto>("/api/transfer/export/preview");
}

export function buildTransferExport(selection: TransferSelectionPayload) {
  return requestJson<TransferExportBuildResponseDto>("/api/transfer/export/build", {
    method: "POST",
    body: JSON.stringify({ selection }),
  });
}

export function previewTransferImport(bundle: Record<string, unknown>, applyEnvironment = false, overwriteWorkflows = true) {
  return requestJson<TransferImportPreviewDto>("/api/transfer/import/preview", {
    method: "POST",
    body: JSON.stringify({
      bundle,
      apply_environment: applyEnvironment,
      overwrite_workflows: overwriteWorkflows,
    }),
  });
}

export function importTransferBundle(bundle: Record<string, unknown>, applyEnvironment = false, overwriteWorkflows = true) {
  return requestJson<TransferImportResponseDto>("/api/transfer/import", {
    method: "POST",
    body: JSON.stringify({
      bundle,
      apply_environment: applyEnvironment,
      overwrite_workflows: overwriteWorkflows,
    }),
  });
}
