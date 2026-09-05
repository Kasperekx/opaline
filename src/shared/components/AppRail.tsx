import { CircleHelp, Clock3, Database, Settings2 } from "lucide-react";
import { useState } from "react";
import { HelpDialog } from "./HelpDialog";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

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
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <aside className="app-rail" aria-label="Primary navigation">
      <BrandMark />
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
      </nav>
      <div className="rail-bottom">
        <RailButton
          label="Settings"
          active={activeItem === "settings"}
          onClick={onSettings}
        >
          <Settings2 size={19} />
        </RailButton>
        <RailButton label="Help" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={19} />
        </RailButton>
        <span
          className={`connection-pip ${connected ? "online" : ""}`}
          title={connected ? "Connected" : "Offline"}
        />
      </div>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </aside>
  );
}
