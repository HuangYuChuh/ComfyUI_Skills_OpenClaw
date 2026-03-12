import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  disabled?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

function findEnabledOptionIndex(options: CustomSelectOption[], currentValue: string) {
  const enabledOptions = options.filter((option) => !option.disabled);
  const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue);
  return {
    enabledOptions,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
  };
}

export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  className = "",
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? null,
    [options, value],
  );

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }

  function closeMenu() {
    setOpen(false);
  }

  function clearHostClass() {
    document.querySelectorAll(".custom-select-host-open").forEach((element) => {
      element.classList.remove("custom-select-host-open");
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      clearHostClass();
      return;
    }

    updatePosition();
    const host = rootRef.current?.closest(".card, .page-header, .server-config-container");
    if (host instanceof HTMLElement) {
      clearHostClass();
      host.classList.add("custom-select-host-open");
    }

    return () => {
      clearHostClass();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) {
        return;
      }
      if ((target as HTMLElement | null)?.closest?.(`[data-custom-select-menu="${menuId}"]`)) {
        return;
      }
      closeMenu();
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
        triggerRef.current?.focus();
      }
    }

    function onViewportChange() {
      updatePosition();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [menuId, open]);

  useEffect(() => () => clearHostClass(), []);

  function selectNext(direction: 1 | -1) {
    const { enabledOptions, currentIndex } = findEnabledOptionIndex(options, value);
    if (!enabledOptions.length) {
      return;
    }
    const nextIndex = (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    onChange(enabledOptions[nextIndex].value);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectNext(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectNext(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      closeMenu();
    }
  }

  return (
    <div ref={rootRef} className={`custom-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="custom-select-value">{selectedOption?.label ?? ""}</span>
        <span className="custom-select-chevron" aria-hidden="true" />
      </button>

      {open && position
        ? createPortal(
            <div
              id={menuId}
              className="custom-select-menu is-open"
              role="listbox"
              data-custom-select-menu={menuId}
              style={{
                position: "fixed",
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width}px`,
              }}
            >
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`custom-select-option ${selected ? "is-selected" : ""}`.trim()}
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onClick={() => {
                      onChange(option.value);
                      closeMenu();
                      triggerRef.current?.focus();
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
