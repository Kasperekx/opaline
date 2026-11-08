import { Activity, ArrowRight, Database, Send } from "lucide-react";
import { Reveal } from "@/components/reveal";
import styles from "./product-vision.module.css";

const capabilities = [
  {
    title: "Databases",
    status: "First release",
    icon: Database,
    focus: "PostgreSQL",
    description:
      "Query, edit, and explore your data. A focused database client is where we start.",
    phase: "launch",
  },
  {
    title: "API requests",
    status: "Exploring",
    icon: Send,
    focus: "Requests + database calls",
    description:
      "Connect an endpoint’s response to the SQL behind it, in the same project context.",
    phase: "future",
  },
  {
    title: "Logs & traces",
    status: "Exploring",
    icon: Activity,
    focus: "Connected diagnostics",
    description:
      "Bring relevant logs and traces from your existing tools alongside the data you’re investigating.",
    phase: "future",
  },
] as const;

export function ProductVision() {
  return (
    <section
      id="vision"
      className={`${styles.section} wrap`}
      aria-labelledby="vision-title"
    >
      <Reveal className={styles.intro}>
        <div>
          <p className="eyebrow">
            <span>05</span> THE BIGGER PICTURE
          </p>
          <h2 id="vision-title">
            Starting with databases. <span>Connecting your workflow.</span>
          </h2>
        </div>
        <div className={styles.description}>
          <p>
            Your work doesn’t stop at the database. Our vision is one developer
            workspace for your data, API requests, and diagnostics — connected
            around the project you’re building.
          </p>
          <a className="text-link" href="#roadmap">
            See the roadmap <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </Reveal>

      <figure className={styles.map}>
        <Reveal className={styles.context}>
          <span className="brand-mark" aria-hidden="true" />
          <span>One workspace</span>
          <span className={styles.contextDetail}>Shared project context</span>
        </Reveal>
        <ul className={styles.capabilities} aria-label="Product direction">
          {capabilities.map(
            ({ title, status, icon: Icon, focus, description, phase }, index) => (
              <li key={title} data-phase={phase}>
                <Reveal delay={index * 60}>
                  <div className={styles.capabilityHeading}>
                    <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                    <span className={styles.status}>{status}</span>
                  </div>
                  <h3>{title}</h3>
                  <p className={styles.focus}>{focus}</p>
                  <p className={styles.capabilityDescription}>{description}</p>
                </Reveal>
              </li>
            ),
          )}
        </ul>
        <figcaption className={styles.caption}>
          Conceptual workflow. API and diagnostics are not available yet.
        </figcaption>
      </figure>

      <Reveal className={styles.goal}>
        <p>
          The goal: follow a request through its SQL and logs, without leaving your
          project.
        </p>
        <span>Our direction, not a release commitment.</span>
      </Reveal>
    </section>
  );
}
