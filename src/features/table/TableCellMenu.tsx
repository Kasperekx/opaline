import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type CellMenuAction = {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  groupStart?: boolean;
};
export function TableCellMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: CellMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Cell actions"
      className="table-cell-menu"
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 240)),
        top: Math.max(
          8,
          Math.min(y, window.innerHeight - actions.length * 38 - 24),
        ),
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) ?? [],
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          role="menuitem"
          disabled={action.disabled}
          className={`${action.danger ? "danger" : ""} ${action.groupStart ? "menu-group-start" : ""}`}
          onClick={() => {
            onClose();
            action.run();
          }}
        >
          {action.label}
          {action.shortcut && <kbd>{action.shortcut}</kbd>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
