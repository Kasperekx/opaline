import {
  ArrowRight,
  Cable,
  KeyRound,
  Layers3,
  Plus,
  Monitor,
  Terminal,
} from "lucide-react";
import { ProductPreview } from "@/components/product-preview";
import { ProductPrinciples } from "@/components/product-principles";
import { Reveal } from "@/components/reveal";
import { HeroAperture } from "@/components/hero-aperture";
import { Providers } from "@/components/providers";
import { DeveloperWorkflow } from "@/components/developer-workflow";
import { SchemaShowcase } from "@/components/schema-showcase";
import { LaunchStatus } from "@/components/launch-status";
import { BetaWaitlist } from "@/components/beta-waitlist";
import { PerformanceAudit } from "@/components/performance-audit";
import { ProductVision } from "@/components/product-vision";

export default function Home() {
  return (
    <>
      {process.env.OPALINE_PERFORMANCE_AUDIT === "1" && <PerformanceAudit />}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="reading-progress" aria-hidden="true" />
      <header className="site-header">
        <div className="wrap header-inner">
          <a href="#" className="wordmark" aria-label="Opaline home">
            <span className="brand-mark" aria-hidden="true" />
            opaline
          </a>
          <nav aria-label="Main navigation">
            <a href="#product">Product</a>
            <a href="#approach">Features</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
          <a className="header-questions" href="#questions">
            FAQ
          </a>
          <a className="header-launch primary-action" href="#beta">
            Beta access <ArrowRight size={14} />
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="hero-scene" aria-labelledby="hero-title">
          <HeroAperture />
          <div className="hero">
            <p className="hero-availability">
              <LaunchStatus />
              <span>PostgreSQL · macOS on Apple Silicon</span>
            </p>
            <h1 id="hero-title">
              <span className="hero-line">A database client</span>
              <span className="hero-line hero-line-accent">
                built around your projects.
              </span>
            </h1>
            <div className="hero-bottom">
              <p className="hero-description">
                Keep project connections and queries together. Explore
                relationships and review table edits before applying them.
              </p>
              <div className="hero-actions">
                <a className="action primary-action" href="#beta">
                  Beta access <ArrowRight size={17} />
                </a>
                <a className="text-link" href="#product">
                  See the app <ArrowRight size={15} />
                </a>
              </div>
            </div>
          </div>
        </section>
        <section
          className="product-section wrap"
          id="product"
          aria-labelledby="product-title"
        >
          <Reveal className="section-intro">
            <div>
              <p className="eyebrow">
                <span>01</span> THE WORKSPACE
              </p>
              <h2 id="product-title">
                Your database. <span>In focus.</span>
              </h2>
            </div>
            <p>
              Your tables, open queries, and connections. Right where you left
              them.
            </p>
          </Reveal>
          <div className="product-halo" aria-hidden="true" />
          <div className="product-stage">
            <ProductPreview />
          </div>
        </section>
        <div className="product-facts wrap" aria-label="Opaline at a glance">
          <div>
            <Cable size={20} />
            <span>
              Direct connections<small>No Opaline cloud relay</small>
            </span>
          </div>
          <div>
            <KeyRound size={20} />
            <span>
              System credential store<small>For your saved passwords</small>
            </span>
          </div>
          <div>
            <Layers3 size={20} />
            <span>
              Local profiles
              <small>Connection settings stay on your device</small>
            </span>
          </div>
        </div>
        <section
          className="principles-section wrap"
          id="approach"
          aria-labelledby="principles-title"
        >
          <Reveal>
            <p className="eyebrow">
              <span>02</span> WORKING WITH YOUR DATA
            </p>
            <h2 className="statement" id="principles-title">
              <strong>Stay with the problem.</strong> Keep your context, review
              your changes, and <em>work at your own pace.</em>
            </h2>
          </Reveal>
          <ProductPrinciples />
        </section>
        <section className="chapters" aria-label="Inside your workflow">
          <div className="wrap">
            <SchemaShowcase />
            <DeveloperWorkflow />
          </div>
        </section>
        <section className="essentials wrap" aria-labelledby="essentials-title">
          <Reveal className="section-heading">
            <p className="eyebrow">
              <span>03</span> INSIDE OPALINE
            </p>
            <h2 id="essentials-title">
              The everyday work,
              <br />
              <span>taken care of.</span>
            </h2>
          </Reveal>
          <div className="detail-list">
            {[
              [
                "01",
                "Write less, find more",
                "SQL completion and formatting while you write. History and bookmarks when you need a query again.",
              ],
              [
                "02",
                "Look inside the value",
                "Inspect JSON and long values without losing your place in the table.",
              ],
              [
                "03",
                "Backup and restore",
                "Create and restore backups with the tools included in Opaline. Restore within the same PostgreSQL major version.",
              ],
              [
                "04",
                "Take your results with you",
                "Export table data as CSV or JSON for the next step in your work.",
              ],
            ].map(([n, title, copy], index) => (
              <Reveal key={n} delay={index * 60}>
                <article>
                  <span className="detail-number">{n}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
        <Providers />
        <ProductVision />
        <section
          className="roadmap wrap"
          id="roadmap"
          aria-labelledby="roadmap-title"
        >
          <Reveal className="roadmap-heading">
            <div>
              <p className="eyebrow">
                <span>06</span> PRODUCT ROADMAP
              </p>
              <h2 id="roadmap-title">
                Next for Opaline.
                <br />
                <span>One step at a time.</span>
              </h2>
            </div>
            <p>
              A focused database client first. More platforms and providers
              next. A wider developer workspace over time.
            </p>
          </Reveal>
          <div className="platform-rail" aria-label="Platform availability">
            <div className="platform-current">
              <Monitor size={20} />
              <strong>macOS</strong>
              <span>Apple Silicon · Coming soon</span>
            </div>
            <div>
              <Monitor size={20} />
              <strong>Windows</strong>
              <span>Planned</span>
            </div>
            <div>
              <Terminal size={20} />
              <strong>Linux</strong>
              <span>Planned</span>
            </div>
          </div>
          <ol className="roadmap-track">
            {[
              [
                "01",
                "First · coming soon",
                "PostgreSQL on macOS",
                "Finishing the desktop experience for the first release.",
                "current",
              ],
              [
                "02",
                "Next · planned",
                "More platforms & databases",
                "Windows and Linux apps, plus MySQL and SQLite connections alongside PostgreSQL.",
                "next",
              ],
              [
                "03",
                "Then · exploration",
                "Connected request debugging",
                "Explore HTTP requests alongside their SQL calls, logs, and traces. Kafka and Docker integrations are longer-term directions.",
                "planned",
              ],
              [
                "04",
                "Later · exploration",
                "AI assistance",
                "AI-assisted queries and explanations. Scope, providers, and privacy controls are still being defined.",
                "later",
              ],
            ].map(([number, status, title, copy, phase], index) => (
              <li key={number} className={phase}>
                <Reveal delay={index * 60}>
                  <div className="roadmap-marker">
                    <span>{number}</span>
                    <small>{status}</small>
                  </div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <div className="roadmap-note">
            <p>Planned, not promised. Timing and scope may change.</p>
            <a className="text-link" href="#product">
              Explore the workspace <ArrowRight size={15} />
            </a>
          </div>
        </section>
        <section className="faq wrap" id="questions">
          <div>
            <p className="eyebrow">A FEW THINGS TO KNOW</p>
            <h2>
              Questions,
              <br />
              <span>answered.</span>
            </h2>
          </div>
          <div>
            {[
              [
                "When can I get Opaline?",
                "The desktop app is coming soon, starting with macOS on Apple Silicon. There is no launch date yet. The product views on this page show the current app with sample data.",
              ],
              [
                "Which databases and platforms are planned?",
                "The first release focuses on PostgreSQL and Apple Silicon Macs. Windows, Linux, MySQL, and SQLite are next on the roadmap. Support for Intel Macs has not been announced.",
              ],
              [
                "How much will Opaline cost?",
                "Opaline will be a paid product. Pricing will be announced before launch.",
              ],
              [
                "Where does my data go?",
                "Your computer connects directly to your database, with no Opaline cloud relay. Profiles stay local; saved passwords use the system credential store. SQL drafts and history are local but not encrypted by Opaline.",
              ],
              [
                "Are these views from the real app?",
                "Yes. The workspace, table, and diagram screenshots are captured from Opaline using fictional sample data. They are product previews, not interactive database connections.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <BetaWaitlist />
      </main>
      <footer className="wrap">
        <a href="#" className="wordmark">
          <span className="brand-mark" aria-hidden="true" />
          opaline
        </a>
        <span>A database client built for your workflow.</span>
        {/* Replace this status with a mailto link once a public contact is chosen. */}
        <span className="footer-contact">Contact details coming soon</span>
        <a href="#questions">
          Questions & answers <ArrowRight size={14} />
        </a>
      </footer>
      <div className="footer-signature wrap" aria-hidden="true">
        opaline<span>↗</span>
      </div>
    </>
  );
}
