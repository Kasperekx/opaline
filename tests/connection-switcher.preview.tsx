// Isolated visual fixture: synthetic profiles, no IPC or real connections.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ConnectionSwitcher } from "../src/features/connections/ConnectionSwitcher";
import { newProfile } from "../src/features/connections/connection-types";
import "../src/App.css";
import "../src/features/connections/connections.css";

const local = {
  ...newProfile("mmo"),
  id: "local",
  name: "MMO · Local development",
  credentialId: null,
};
const staging = {
  ...local,
  id: "staging",
  name: "Matchmaking · European staging environment",
  host: "postgres.internal.eu-west-1.example.test",
  environment: "staging" as const,
  readOnly: true,
};
const current = {
  ...local,
  id: "local-session",
  profileId: local.id,
  serverVersion: "synthetic",
};
const profiles = [
  local,
  staging,
  {
    ...staging,
    id: "production",
    name: "MMO · Production database with a long descriptive name",
    environment: "production" as const,
  },
];

function SwitcherPreview() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ConnectionSwitcher
      current={current}
      workspace={{ id: "mmo", name: "MMO" }}
      profiles={profiles}
      sessions={[
        current,
        { ...current, ...staging, id: "qa-session", profileId: staging.id },
      ]}
      busy={false}
      onSelect={() => setOpen(false)}
      onManage={() => setOpen(false)}
      onClose={() => setOpen(false)}
    />
  ) : (
    <button onClick={() => setOpen(true)}>Open switcher</button>
  );
}

function ResponsivePreview() {
  return (
    <main
      style={{
        display: "flex",
        gap: 16,
        padding: 16,
        overflow: "auto",
        height: "100dvh",
      }}
    >
      {[
        { width: 360, height: 640 },
        { width: 760, height: 480 },
      ].map(({ width, height }) => (
        <section key={width}>
          <p>
            {width} × {height}
          </p>
          <iframe
            title={`Switcher at ${width} × ${height}`}
            width={width}
            height={height}
            src="/tests/connection-switcher.preview.html?frame"
            style={{ border: "1px solid #414a45" }}
          />
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("frame") ? (
    <SwitcherPreview />
  ) : (
    <ResponsivePreview />
  ),
);
