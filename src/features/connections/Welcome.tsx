import {
  ArrowRight,
  ChevronRight,
  Database,
  KeyRound,
  Plus,
  Server,
  ShieldCheck,
} from "lucide-react";
import { AppRail } from "../../shared/components/AppRail";
import { TopBar } from "../../shared/components/TopBar";

const connectionDetails = [
  { label: "Host", value: "localhost" },
  { label: "Port", value: "5432" },
  { label: "Database", value: "postgres" },
  { label: "SSL", value: "Prefer" },
];

export function Welcome({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="home-shell">
      <AppRail />
      <div className="home-main">
        <TopBar
          title="Connections"
          subtitle="PostgreSQL workspace"
          action={
            <button className="button secondary compact" onClick={onConnect}>
              <Plus size={16} /> New connection
            </button>
          }
        />
        <main className="connection-manager">
          <header className="manager-heading">
            <div>
              <span className="section-kicker">Local workspace</span>
              <h1>Database connections</h1>
              <p>Open a recent connection or configure a new PostgreSQL server.</p>
            </div>
          </header>

          <div className="connection-browser">
            <aside className="connection-list" aria-label="Database connections">
              <div className="connection-list-heading">
                <span>Connections</span>
                <span className="connection-count">1</span>
              </div>

              <button className="connection-row selected" onClick={onConnect}>
                <div className="postgres-glyph">
                  <Database size={19} />
                </div>
                <span className="connection-row-copy">
                  <strong>Local PostgreSQL</strong>
                  <small>postgres@localhost:5432</small>
                </span>
                <ChevronRight size={15} />
              </button>

              <button className="add-connection-row" onClick={onConnect}>
                <Plus size={16} />
                <span>Add connection</span>
              </button>
            </aside>

            <section className="connection-detail" aria-labelledby="connection-detail-title">
              <div className="connection-detail-header">
                <div className="postgres-glyph large">
                  <Database size={23} />
                </div>
                <div>
                  <span className="connection-type">PostgreSQL</span>
                  <h2 id="connection-detail-title">Local PostgreSQL</h2>
                  <p>Local development connection</p>
                </div>
                <span className="provider-badge">
                  <Server size={12} /> PostgreSQL
                </span>
              </div>

              <dl className="connection-properties">
                {connectionDetails.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="credential-note">
                <KeyRound size={16} />
                <span>
                  <strong>Credentials are session-only</strong>
                  Enter the password when connecting. Nothing is stored on disk.
                </span>
              </div>

              <div className="connection-detail-actions">
                <button className="button primary" onClick={onConnect}>
                  Connect <ArrowRight size={16} />
                </button>
                <button className="button ghost" onClick={onConnect}>
                  Edit details
                </button>
              </div>
            </section>
          </div>

          <footer className="manager-status">
            <span>
              <ShieldCheck size={14} /> Local-only credentials
            </span>
            <span>PostgreSQL provider</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
