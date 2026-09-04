import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent, ReactNode } from "react";
import { isDesktopRuntime } from "../lib/database-api";

type TopBarProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

const isInteractiveTarget = (target: EventTarget) =>
  target instanceof Element &&
  Boolean(target.closest("button, input, select, a, [data-no-drag]"));

export function TopBar({ title, subtitle, action }: TopBarProps) {
  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (!isDesktopRuntime() || event.button !== 0 || isInteractiveTarget(event.target)) {
      return;
    }

    const window = getCurrentWindow();
    const action = event.detail === 2 ? window.toggleMaximize() : window.startDragging();
    void action.catch(() => undefined);
  };

  return (
    <header
      className="top-bar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      <div className="top-bar-title" data-tauri-drag-region>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {action}
    </header>
  );
}
