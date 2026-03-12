import { useRef } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger";
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Modal
      open={props.open}
      title={props.title}
      onClose={props.onCancel}
      initialFocusRef={confirmButtonRef}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>{props.cancelLabel}</button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`btn ${props.tone === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-modal-message">{props.message}</p>
      {props.checkboxLabel ? (
        <label className="checkbox-inline confirm-modal-checkbox">
          <input
            type="checkbox"
            checked={Boolean(props.checkboxChecked)}
            onChange={(event) => props.onCheckboxChange?.(event.target.checked)}
          />
          <span>{props.checkboxLabel}</span>
        </label>
      ) : null}
    </Modal>
  );
}
