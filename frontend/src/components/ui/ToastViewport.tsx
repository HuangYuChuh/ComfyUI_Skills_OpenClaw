import { useEffect, useRef, useState } from "react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const TOAST_META = {
  success: { icon: "✓", title: "Success" },
  error: { icon: "!", title: "Error" },
  info: { icon: "i", title: "Notice" },
} as const;

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const closeTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(3200);
  const closeRef = useRef<() => void>(() => undefined);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const meta = TOAST_META[toast.type];

  useEffect(() => {
    closingRef.current = false;
    setClosing(false);

    function closeToast() {
      if (dismissTimerRef.current || closingRef.current) {
        return;
      }
      closingRef.current = true;
      setClosing(true);
      dismissTimerRef.current = window.setTimeout(() => {
        onDismiss(toast.id);
      }, 260);
    }

    function startCloseTimer(duration: number) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      startTimeRef.current = Date.now();
      closeTimerRef.current = window.setTimeout(closeToast, duration);
    }

    closeRef.current = closeToast;
    remainingRef.current = 3200;
    startCloseTimer(remainingRef.current);

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, [onDismiss, toast.id]);

  function pauseTimer() {
    if (closing) {
      return;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startTimeRef.current));
  }

  function resumeTimer() {
    if (closing) {
      return;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    startTimeRef.current = Date.now();
    closeTimerRef.current = window.setTimeout(() => closeRef.current(), remainingRef.current);
  }

  return (
    <div
      className={`toast ${toast.type} ${closing ? "closing" : ""}`.trim()}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <span className="toast-icon" aria-hidden="true">{meta.icon}</span>
      <div className="toast-body">
        <p className="toast-title">{meta.title}</p>
        <p className="toast-message">{toast.message}</p>
      </div>
      <button type="button" className="toast-close" aria-label="Close notification" onClick={() => closeRef.current()}>
        ×
      </button>
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div id="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}
