import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { ToastViewport } from "./components/ui/ToastViewport";
import { EditorView } from "./features/editor/EditorView";
import { MainShell } from "./app/MainShell";
import { useAppController } from "./app/useAppController";

export default function App() {
  const controller = useAppController();

  return (
    <>
      <ToastViewport toasts={controller.toasts} onDismiss={controller.dismissToast} />
      {controller.viewMode === "main" ? (
        <MainShell
          language={controller.language}
          setLanguage={controller.setLanguage}
          servers={controller.servers}
          currentServer={controller.currentServer}
          visibleWorkflows={controller.visibleWorkflows}
          currentServerWorkflowsCount={controller.currentServerWorkflows.length}
          serverModalOpen={controller.serverModalOpen}
          serverModalMode={controller.serverModalMode}
          serverForm={controller.serverForm}
          workflowSearch={controller.workflowSearch}
          workflowSort={controller.workflowSort}
          onSelectServer={controller.setCurrentServerId}
          onToggleServer={controller.handleToggleServer}
          onDeleteServer={controller.requestDeleteServer}
          onOpenCreateServer={controller.handleAddServer}
          onOpenEditServer={controller.handleEditServer}
          onServerFormChange={controller.setServerForm}
          onCloseServerModal={() => controller.setServerModalOpen(false)}
          onSubmitServerModal={controller.handleSubmitServerModal}
          onWorkflowSearchChange={controller.setWorkflowSearch}
          onWorkflowSortChange={controller.setWorkflowSort}
          onCreateWorkflow={controller.createWorkflow}
          onEditWorkflow={controller.handleEditWorkflow}
          onDeleteWorkflow={controller.handleDeleteWorkflow}
          onToggleWorkflow={controller.handleToggleWorkflow}
          onUploadWorkflowVersion={controller.handleUploadWorkflowVersion}
          onReorderWorkflows={controller.handleReorderWorkflows}
          t={controller.t}
        />
      ) : (
        <EditorView
          workflowId={controller.editorState.workflowId}
          description={controller.editorState.description}
          schemaParams={controller.editorState.schemaParams}
          hasWorkflow={Boolean(controller.editorState.workflowData)}
          emptyStateMessageKey={controller.editorEmptyStateMessageKey}
          mode={controller.editorState.editingWorkflowId ? "edit" : "create"}
          editingWorkflowId={controller.editorState.editingWorkflowId}
          upgradeSummary={controller.editorState.upgradeSummary}
          filters={controller.editorFilters}
          collapsedNodeIds={controller.collapsedNodeIds}
          expandedParamKeys={controller.expandedParamKeys}
          groupedNodes={controller.groupedNodes}
          summaryText={controller.mappingSummaryText}
          searchInputRef={controller.mappingSearchRef}
          onBack={controller.handleBackFromEditor}
          onWorkflowIdChange={controller.handleWorkflowIdChange}
          onDescriptionChange={(value) => controller.setEditorState((current) => ({ ...current, description: value, hasUnsavedChanges: true }))}
          onUploadFile={controller.handleEditorUpload}
          onSave={controller.handleSaveWorkflow}
          onFilterChange={(next) => controller.setEditorFilters((current) => ({ ...current, ...next }))}
          onResetFilters={() => controller.setEditorFilters({
            query: "",
            exposedOnly: false,
            requiredOnly: false,
            nodeSort: "node_id_asc",
            paramSort: "default",
          })}
          onToggleNode={(nodeId) => controller.setCollapsedNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
            return next;
          })}
          onToggleParamConfig={(key) => controller.setExpandedParamKeys((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}
          onUpdateParam={controller.updateEditorParam}
          onApplyRecommended={controller.applyRecommendedExposures}
          onExposeVisible={controller.exposeVisible}
          onCollapseAll={(collapsed) => {
            if (collapsed) {
              controller.setCollapsedNodeIds(new Set(controller.groupedNodes.map(([nodeId]) => nodeId)));
            } else {
              controller.setCollapsedNodeIds(new Set());
            }
          }}
          t={controller.t}
        />
      )}

      <ConfirmDialog
        open={controller.confirmState.open}
        title={controller.confirmState.title}
        message={controller.confirmState.message}
        confirmLabel={controller.confirmState.confirmLabel}
        cancelLabel={controller.confirmState.cancelLabel}
        tone={controller.confirmState.tone}
        checkboxLabel={controller.confirmState.checkboxLabel}
        checkboxChecked={controller.confirmState.checkboxChecked}
        onCheckboxChange={(checked) => controller.setConfirmState((current) => ({ ...current, checkboxChecked: checked }))}
        onCancel={() => controller.resolveConfirm(false)}
        onConfirm={() => controller.resolveConfirm(true)}
      />

      <input
        ref={controller.versionUploadRef}
        type="file"
        accept=".json"
        className="sr-only"
        onChange={(event) => {
          controller.handleVersionFileChange(event.target.files?.[0] || null);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
