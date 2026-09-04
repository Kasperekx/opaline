import {
  Blocks,
  CircleHelp,
  Clock3,
  Database,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";

type RailButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

function RailButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <button
      className={`rail-button ${active ? "active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}

export type RailItem = "connections" | "history" | "settings";

type AppRailProps = {
  activeItem?: RailItem;
  connected?: boolean;
  onConnections?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
};

export function AppRail({
  activeItem = "connections",
  connected = false,
  onConnections,
  onHistory,
  onSettings,
}: AppRailProps) {
  return (
    <aside className="app-rail" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Opaline">
        <span />
      </div>
      <nav>
        <RailButton
          label="Connections"
          active={activeItem === "connections"}
          onClick={onConnections}
        >
          <Database size={19} />
        </RailButton>
        <RailButton
          label="Query history"
          active={activeItem === "history"}
          onClick={onHistory}
        >
          <Clock3 size={19} />
        </RailButton>
        <RailButton label="Saved queries · coming soon" disabled>
          <Blocks size={19} />
        </RailButton>
      </nav>
      <div className="rail-bottom">
        <RailButton
          label="Settings"
          active={activeItem === "settings"}
          onClick={onSettings}
        >
          <Settings2 size={19} />
        </RailButton>
        <RailButton label="Help">
          <CircleHelp size={19} />
        </RailButton>
        <span
          className={`connection-pip ${connected ? "online" : ""}`}
          title={connected ? "Connected" : "Offline"}
        />
      </div>
    </aside>
  );
}
