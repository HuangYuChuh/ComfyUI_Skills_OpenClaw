import { useEffect, useRef, type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  width?: "normal" | "wide";
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Modal({ open, title, onClose, actions, width = "normal", initialFocusRef, children }: ModalProps) {
  const latestOnCloseRef = useRef(onClose);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (cardRef.current?.contains(activeElement)) {
        return;
      }
      initialFocusRef?.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        latestOnCloseRef.current();
      }
    }

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}
    >
      <div ref={cardRef} className={`modal-card ${width === "wide" ? "modal-card-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 className="card-title">{title}</h3>
        </div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
