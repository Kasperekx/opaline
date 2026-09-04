import type { KeyboardEvent, PointerEvent } from "react";

type ResizeHandleProps = {
  className?: string;
  label: string;
  maximum: number;
  minimum: number;
  orientation: "horizontal" | "vertical";
  value: number;
  onResize: (delta: number) => void;
  onReset: () => void;
};

export function ResizeHandle({
  className = "",
  label,
  maximum,
  minimum,
  orientation,
  value,
  onResize,
  onReset,
}: ResizeHandleProps) {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    let previous = orientation === "vertical" ? event.clientX : event.clientY;
    document.body.dataset.resizing = orientation;

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const current =
        orientation === "vertical" ? moveEvent.clientX : moveEvent.clientY;
      onResize(current - previous);
      previous = current;
    };
    const finishResizing = () => {
      delete document.body.dataset.resizing;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResizing);
      window.removeEventListener("pointercancel", finishResizing);
      window.removeEventListener("blur", finishResizing);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResizing, { once: true });
    window.addEventListener("pointercancel", finishResizing, { once: true });
    window.addEventListener("blur", finishResizing, { once: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      orientation === "vertical"
        ? event.key === "ArrowLeft"
          ? -12
          : event.key === "ArrowRight"
            ? 12
            : 0
        : event.key === "ArrowUp"
          ? -12
          : event.key === "ArrowDown"
            ? 12
            : 0;
    if (!delta) return;
    event.preventDefault();
    onResize(delta);
  };

  return (
    <button
      className={`resize-handle ${className}`}
      type="button"
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemax={maximum}
      aria-valuemin={minimum}
      aria-valuenow={Math.round(value)}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    />
  );
}
