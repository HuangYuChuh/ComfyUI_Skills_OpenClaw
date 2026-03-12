import type { ToastMessage } from "../components/ui/ToastViewport";
import type { SaveServerPayload } from "../types/api";
import type { EditorState } from "../types/editor";

export type ViewMode = "main" | "editor";
export type ServerModalMode = "add" | "edit";

export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onResolve?: (confirmed: boolean, checked: boolean) => void;
}

export interface EditorFilters {
  query: string;
  exposedOnly: boolean;
  requiredOnly: boolean;
  nodeSort: string;
  paramSort: string;
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function defaultServerForm(): SaveServerPayload {
  return {
    id: "",
    name: "",
    url: "",
    enabled: true,
    output_dir: "./outputs",
  };
}

export function defaultEditorState(): EditorState {
  return {
    workflowData: null,
    schemaParams: {},
    workflowId: "",
    description: "",
    editingWorkflowId: null,
    hasUnsavedChanges: false,
    upgradeSummary: null,
  };
}

export function defaultEditorFilters(): EditorFilters {
  return {
    query: "",
    exposedOnly: false,
    requiredOnly: false,
    nodeSort: "node_id_asc",
    paramSort: "default",
  };
}

export function initialConfirmState(): ConfirmState {
  return {
    open: false,
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
    tone: "primary",
  };
}

export function createToast(type: ToastMessage["type"], message: string): ToastMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
  };
}
