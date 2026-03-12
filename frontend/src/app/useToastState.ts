import { useState } from "react";
import type { ToastMessage } from "../components/ui/ToastViewport";
import { createToast } from "./state";

export function useToastState() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(type: ToastMessage["type"], message: string) {
    setToasts((current) => [...current.slice(-3), createToast(type, message)]);
  }

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return {
    toasts,
    dismissToast,
    pushToast,
  };
}
