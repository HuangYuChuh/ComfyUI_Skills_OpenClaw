import { useEffect, type RefObject } from "react";
import { initPixelBlastBackground } from "../lib/pixelBlastBackground";
import { safeWriteLocalStorage } from "../lib/storage";
import type { ToastMessage } from "../components/ui/ToastViewport";
import type { TranslateFn, ViewMode } from "./state";

interface UseAppEffectsArgs {
  language: string;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  loadInitialServers: () => Promise<void>;
  refreshWorkflows: () => Promise<void>;
  pushToast: (type: "error", message: string) => void;
  t: TranslateFn;
  viewMode: ViewMode;
  hasUnsavedChanges: boolean;
  confirmOpen: boolean;
  serverModalOpen: boolean;
  editorQuery: string;
  clearEditorQuery: () => void;
  mappingSearchRef: RefObject<HTMLInputElement | null>;
  saveWorkflow: () => Promise<void>;
}

export function useAppEffects(args: UseAppEffectsArgs) {
  useEffect(() => {
    safeWriteLocalStorage("ui-lang", args.language);
  }, [args.language]);

  useEffect(() => {
    const timerIds = args.toasts.map((toast) => window.setTimeout(() => args.dismissToast(toast.id), 3200));
    return () => {
      timerIds.forEach((id) => window.clearTimeout(id));
    };
  }, [args.dismissToast, args.toasts]);

  useEffect(() => {
    Promise.all([args.loadInitialServers(), args.refreshWorkflows()]).catch((error: unknown) => {
      args.pushToast("error", error instanceof Error ? error.message : args.t("err_load_cfg"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => initPixelBlastBackground({
    variant: "circle",
    pixelSize: 4,
    color: "#a0223b",
    patternScale: 2,
    patternDensity: 1,
    pixelSizeJitter: 0,
    enableRipples: true,
    rippleSpeed: 0.4,
    rippleThickness: 0.12,
    rippleIntensityScale: 1.5,
    speed: 0.5,
    edgeFade: 0.25,
    transparent: true,
  }) || undefined, []);

  useEffect(() => {
    if (args.viewMode === "editor") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [args.viewMode]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!args.hasUnsavedChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [args.hasUnsavedChanges]);

  useEffect(() => {
    function handleEditorShortcuts(event: KeyboardEvent) {
      if (args.viewMode !== "editor" || args.confirmOpen || args.serverModalOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isInputLike = Boolean(
        target
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable),
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void args.saveWorkflow();
        return;
      }

      if (!isInputLike && event.key === "/") {
        event.preventDefault();
        args.mappingSearchRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && document.activeElement === args.mappingSearchRef.current && args.editorQuery) {
        args.clearEditorQuery();
      }
    }

    document.addEventListener("keydown", handleEditorShortcuts);
    return () => document.removeEventListener("keydown", handleEditorShortcuts);
  }, [
    args.clearEditorQuery,
    args.confirmOpen,
    args.editorQuery,
    args.mappingSearchRef,
    args.saveWorkflow,
    args.serverModalOpen,
    args.viewMode,
  ]);
}
