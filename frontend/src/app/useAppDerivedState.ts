import { useMemo } from "react";
import { groupSchemaParams } from "../lib/workflowMapper";
import type { ServerDto, WorkflowSummaryDto } from "../types/api";
import type { SchemaParam, SchemaParamMap } from "../types/editor";
import type { EditorFilters, TranslateFn } from "./state";

interface UseAppDerivedStateArgs {
  currentServerId: string | null;
  defaultServerId: string | null;
  servers: ServerDto[];
  workflows: WorkflowSummaryDto[];
  workflowSearch: string;
  workflowSort: string;
  editorFilters: EditorFilters;
  schemaParams: SchemaParamMap;
  t: TranslateFn;
}

export function useAppDerivedState(args: UseAppDerivedStateArgs) {
  const currentServer = useMemo(() => {
    const resolvedId = args.currentServerId || args.defaultServerId || args.servers[0]?.id || null;
    return args.servers.find((server) => server.id === resolvedId) || null;
  }, [args.currentServerId, args.defaultServerId, args.servers]);

  const effectiveServerId = currentServer && !currentServer.unsupported ? currentServer.id : null;

  const currentServerWorkflows = useMemo(
    () => args.workflows.filter((workflow) => workflow.server_id === effectiveServerId),
    [effectiveServerId, args.workflows],
  );

  const visibleWorkflows = useMemo(() => {
    const items = [...currentServerWorkflows];
    switch (args.workflowSort) {
      case "updated_desc":
        items.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        break;
      case "name_asc":
        items.sort((a, b) => a.id.localeCompare(b.id));
        break;
      case "name_desc":
        items.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case "enabled_first":
        items.sort((a, b) => {
          if (a.enabled !== b.enabled) {
            return a.enabled ? -1 : 1;
          }
          return a.id.localeCompare(b.id);
        });
        break;
      default:
        break;
    }

    const query = args.workflowSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((workflow) => {
      const haystack = [
        workflow.id,
        workflow.description,
        workflow.server_name,
        workflow.server_id,
        workflow.source_label,
        ...(workflow.tags || []),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [args.workflowSearch, args.workflowSort, currentServerWorkflows]);

  const groupedNodes = useMemo(() => {
    const query = args.editorFilters.query.trim().toLowerCase();
    const grouped = groupSchemaParams(args.schemaParams) as Array<[number, { classType: string; params: Array<SchemaParam & { key: string }> }]>;
    const sortNodes = [...grouped].sort((first, second) => {
      if (args.editorFilters.nodeSort === "node_id_desc") {
        return Number(second[0]) - Number(first[0]);
      }
      if (args.editorFilters.nodeSort === "class_asc") {
        return String(first[1].classType).localeCompare(String(second[1].classType));
      }
      return Number(first[0]) - Number(second[0]);
    });

    return sortNodes
      .map(([nodeId, nodeData]) => {
        const params = [...nodeData.params]
          .sort((first, second) => {
            switch (args.editorFilters.paramSort) {
              case "field_asc":
                return first.field.localeCompare(second.field);
              case "type_asc":
                return String(first.type).localeCompare(String(second.type));
              case "exposed_first":
                if (first.exposed !== second.exposed) {
                  return first.exposed ? -1 : 1;
                }
                return first.field.localeCompare(second.field);
              default:
                return 0;
            }
          })
          .filter((param) => {
            if (args.editorFilters.exposedOnly && !param.exposed) {
              return false;
            }
            if (args.editorFilters.requiredOnly && !param.required) {
              return false;
            }
            if (!query) {
              return true;
            }
            const haystack = [nodeData.classType, String(nodeId), param.field, param.name, param.description, String(param.currentVal ?? "")]
              .join(" ")
              .toLowerCase();
            return haystack.includes(query);
          });
        return [String(nodeId), { classType: nodeData.classType, params }] as [string, { classType: string; params: Array<SchemaParam & { key: string }> }];
      })
      .filter(([, nodeData]) => nodeData.params.length > 0);
  }, [args.editorFilters, args.schemaParams]);

  const mappingSummaryText = useMemo(() => {
    const totalParams = Object.values(args.schemaParams).length;
    if (!totalParams) {
      return "";
    }
    const totalExposed = Object.values(args.schemaParams).filter((parameter) => parameter.exposed).length;
    const visibleParams = groupedNodes.reduce((sum, [, nodeData]) => sum + nodeData.params.length, 0);
    return args.t("mapping_summary", {
      visible_params: visibleParams,
      total_params: totalParams,
      exposed_params: totalExposed,
      visible_nodes: groupedNodes.length,
    });
  }, [args.schemaParams, groupedNodes, args.t]);

  return {
    currentServer,
    effectiveServerId,
    currentServerWorkflows,
    visibleWorkflows,
    groupedNodes,
    mappingSummaryText,
    editorEmptyStateMessageKey: Object.keys(args.schemaParams).length === 0 ? "empty_nodes" : "empty_nodes_filtered",
  };
}
