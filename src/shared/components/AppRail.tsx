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
  children: ReactNode;
};

function RailButton({ label, active = false, children }: RailButtonProps) {
  return (
    <button
      className={`rail-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function AppRail({ connected = false }: { connected?: boolean }) {
  return (
    <aside className="app-rail" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Opaline">
        <span />
      </div>
      <nav>
        <RailButton label="Connections" active>
          <Database size={19} />
        </RailButton>
        <RailButton label="Query history">
          <Clock3 size={19} />
        </RailButton>
        <RailButton label="Saved queries">
          <Blocks size={19} />
        </RailButton>
      </nav>
      <div className="rail-bottom">
        <RailButton label="Settings">
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
