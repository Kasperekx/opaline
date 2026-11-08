import { ArrowRight } from "lucide-react";
import { AnimatedBeam } from "@/components/animated-beam";
import { Reveal } from "@/components/reveal";
import styles from "./providers.module.css";

export function Providers() {
  return (
    <section
      id="providers"
      className={styles.section}
      aria-labelledby="providers-title"
    >
      <div className="wrap">
        <div className={styles.content}>
          <Reveal className={styles.copy}>
            <p className="eyebrow">
              <span>04</span> DATABASE SUPPORT
            </p>
            <h2 id="providers-title">
              PostgreSQL first.
              <br />
              <span>More on the way.</span>
            </h2>
            <p className={styles.description}>
              Start with PostgreSQL. MySQL and SQLite are planned next, with the
              same familiar workspace.
            </p>
            <div className={styles.availability}>
              <span aria-hidden="true" /> PostgreSQL at launch
            </div>
            <a className="text-link" href="#roadmap">
              See what’s planned <ArrowRight size={15} />
            </a>
          </Reveal>
          <AnimatedBeam />
        </div>
      </div>
    </section>
  );
}
