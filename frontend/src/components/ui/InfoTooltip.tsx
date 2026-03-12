import { useId, useState } from "react";

interface InfoTooltipProps {
  label: string;
  content: string;
}

export function InfoTooltip(props: InfoTooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="info-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label={props.label}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span aria-hidden="true">?</span>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`info-tooltip-popup${open ? " is-open" : ""}`}
      >
        {props.content}
      </span>
    </span>
  );
}
