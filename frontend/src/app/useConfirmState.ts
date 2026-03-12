import { useState } from "react";
import type { ConfirmState } from "./state";
import { initialConfirmState } from "./state";

export function useConfirmState() {
  const [confirmState, setConfirmState] = useState<ConfirmState>(initialConfirmState());

  function closeConfirm() {
    setConfirmState((current) => ({ ...current, open: false, onResolve: undefined }));
  }

  function resolveConfirm(confirmed: boolean) {
    const checked = confirmState.checkboxChecked ?? false;
    const onResolve = confirmState.onResolve;
    closeConfirm();
    onResolve?.(confirmed, checked);
  }

  async function confirm(options: Omit<ConfirmState, "open" | "onResolve">) {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        open: true,
        onResolve: (confirmed) => resolve(confirmed),
      });
    });
  }

  return {
    confirmState,
    setConfirmState,
    resolveConfirm,
    confirm,
  };
}
