import type { RefObject } from "react";
import type { SchemaParam, SchemaParamMap, UpgradeSummary } from "../../types/editor";

export interface MappingParam extends SchemaParam {
  key: string;
}

export interface MappingNodeGroup {
  classType: string;
  params: MappingParam[];
}

export interface EditorFiltersState {
  query: string;
  exposedOnly: boolean;
  requiredOnly: boolean;
  nodeSort: string;
  paramSort: string;
}

export interface EditorViewProps {
  workflowId: string;
  description: string;
  schemaParams: SchemaParamMap;
  hasWorkflow: boolean;
  emptyStateMessageKey: string;
  mode: "create" | "edit";
  editingWorkflowId?: string | null;
  upgradeSummary: UpgradeSummary | null;
  filters: EditorFiltersState;
  collapsedNodeIds: Set<string>;
  expandedParamKeys: Set<string>;
  groupedNodes: Array<[string, MappingNodeGroup]>;
  summaryText: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onWorkflowIdChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onUploadFile: (file: File | null) => void;
  onSave: () => void;
  onFilterChange: (next: Partial<EditorFiltersState>) => void;
  onResetFilters: () => void;
  onToggleNode: (nodeId: string) => void;
  onToggleParamConfig: (key: string) => void;
  onUpdateParam: (
    key: string,
    field: keyof SchemaParam | "name" | "exposed" | "description" | "required" | "type",
    value: unknown,
  ) => void;
  onApplyRecommended: () => void;
  onExposeVisible: (exposed: boolean) => void;
  onCollapseAll: (collapsed: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}
