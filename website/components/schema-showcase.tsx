import Image from "next/image";
import { ArrowUpRight, GitBranch, TableProperties } from "lucide-react";
import { Reveal } from "@/components/reveal";
import styles from "./schema-showcase.module.css";

/** Real app captures. Cropping, depth, and edge fades belong to the presentation. */
export function SchemaShowcase() {
  return (
    <article
      className={`chapter ${styles.section}`}
      id="schema"
      aria-labelledby="schema-title"
    >
      <div className="chapter-rail">
        <span>WORKSPACE / 01</span>
        <span>FROM THE BIG PICTURE TO THE DETAILS</span>
      </div>
      <Reveal className={styles.heading}>
        <div>
          <p className="eyebrow">DATABASE DIAGRAMS & STRUCTURE</p>
          <h2 id="schema-title">
            See how your
            <br />
            <span>data fits together.</span>
          </h2>
        </div>
        <div className={styles.copy}>
          <p>
            A database is more than a list of tables. Map your schema, follow
            foreign keys, and inspect the columns behind each relationship. Go
            from the whole picture to the table you need.
          </p>
          <a
            className={styles.textLink}
            href="/screenshots/schema-diagram.jpg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the diagram <ArrowUpRight size={16} />
            <span className="sr-only">
              {" "}
              (full-resolution screenshot, new tab)
            </span>
          </a>
        </div>
      </Reveal>
      <figure className={styles.figure}>
        <Reveal className={styles.stage} variant="screen">
          <div className={styles.ambient} aria-hidden="true" />
          <div className={styles.structure}>
            <div className={styles.viewport}>
              <Image
                src="/screenshots/schema-structure.jpg"
                width={1280}
                height={720}
                unoptimized
                alt="Opaline’s Structure view for Atlas orders, showing column types, the order_id primary key, defaults, and constraint tabs."
                className={styles.capture}
              />
            </div>
          </div>
          <div className={styles.diagram}>
            <div className={styles.viewport}>
              <Image
                src="/screenshots/schema-diagram.jpg"
                width={1280}
                height={720}
                unoptimized
                alt="Opaline’s Atlas database diagram connects customers, orders, subscriptions, products, invoices, payments, and events through their PostgreSQL foreign keys."
                className={styles.capture}
              />
            </div>
          </div>
        </Reveal>
        <figcaption className={styles.caption}>
          <span>Real Opaline views. Sample schema.</span>
          <div className={styles.captureLinks}>
            <a
              href="/screenshots/schema-diagram.jpg"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitBranch size={14} /> Diagram <ArrowUpRight size={12} />
              <span className="sr-only">
                {" "}
                screenshot, full resolution (new tab)
              </span>
            </a>
            <a
              href="/screenshots/schema-structure.jpg"
              target="_blank"
              rel="noopener noreferrer"
            >
              <TableProperties size={14} /> Structure <ArrowUpRight size={12} />
              <span className="sr-only">
                {" "}
                screenshot, full resolution (new tab)
              </span>
            </a>
          </div>
        </figcaption>
      </figure>
      <div className={styles.details}>
        <div>
          <span className={styles.number}>01</span>
          <p>
            <strong>Map the relationships.</strong> Tables and foreign keys, on
            one canvas.
          </p>
        </div>
        <div>
          <span className={styles.number}>02</span>
          <p>
            <strong>Get the details.</strong> Columns, types, indexes, and
            constraints.
          </p>
        </div>
        <div>
          <span className={styles.number}>03</span>
          <p>
            <strong>Keep exploring.</strong> Open a table straight from the
            diagram.
          </p>
        </div>
      </div>
    </article>
  );
}
