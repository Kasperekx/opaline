import type { ReactNode } from "react";
import { handleWindowDrag } from "../lib/window-drag";

type TopBarProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header
      className="top-bar"
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
    >
      <div className="top-bar-title" data-tauri-drag-region>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {action}
    </header>
  );
}
