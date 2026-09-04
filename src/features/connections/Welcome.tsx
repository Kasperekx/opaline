import { ArrowRight, Database, Ellipsis, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AppRail } from "../../shared/components/AppRail";
import { TopBar } from "../../shared/components/TopBar";

export function Welcome({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="home-shell">
      <AppRail />
      <div className="home-main">
        <TopBar
          title="Opaline"
          subtitle="Local-first PostgreSQL workspace"
          action={
            <button className="button secondary compact" onClick={onConnect}>
              <Plus size={16} /> New connection
            </button>
          }
        />
        <main className="welcome">
          <section className="welcome-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> Open source · private by default
            </div>
            <h1>
              Your databases,
              <br />
              <span>without the noise.</span>
            </h1>
            <p>
              A calm, precise workspace for PostgreSQL. Credentials stay on your
              machine and queries go straight to your database.
            </p>
            <button className="button primary hero-action" onClick={onConnect}>
              Connect PostgreSQL <ArrowRight size={17} />
            </button>
          </section>

          <section className="connection-section" aria-labelledby="connections-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Workspace</span>
                <h2 id="connections-title">Connections</h2>
              </div>
              <button className="icon-button" aria-label="Connection options" disabled>
                <Ellipsis size={18} />
              </button>
            </div>
            <button className="connection-card" onClick={onConnect}>
              <div className="postgres-glyph">
                <Database size={22} />
              </div>
              <div className="connection-card-copy">
                <strong>Local PostgreSQL</strong>
                <span>localhost:5432 · postgres</span>
              </div>
              <span className="connect-label">
                Connect <ArrowRight size={15} />
              </span>
            </button>
            <button className="new-connection-card" onClick={onConnect}>
              <Plus size={18} />
              <span>
                <strong>Add another connection</strong>
                <small>PostgreSQL is available in this first release</small>
              </span>
            </button>
          </section>

          <div className="privacy-note">
            <ShieldCheck size={18} />
            <span>
              <strong>No account. No cloud.</strong> Your database credentials never
              touch our servers.
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
