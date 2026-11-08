import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "./reveal";
import styles from "./product-preview.module.css";

export function ProductPreview() {
  return (
    <figure className={styles.figure}>
      <Reveal className={styles.stage} variant="screen">
        <div className={styles.viewport}>
          <Image
            className={styles.capture}
            src="/screenshots/workspace-overview.jpg"
            width={1280}
            height={720}
            unoptimized
            alt="Opaline’s desktop workspace with the database explorer, open customers, subscriptions and orders tabs, and an orders table filled with sample customers, statuses, amounts, dates and JSON data."
          />
        </div>
      </Reveal>
      <figcaption className={styles.caption}>
        <span>Real app. Sample data.</span>
        <a
          href="/screenshots/workspace-overview.jpg"
          target="_blank"
          rel="noopener noreferrer"
        >
          View full workspace <ArrowUpRight size={14} aria-hidden="true" />
          <span className="sr-only">
            {" "}
            (full-resolution screenshot, new tab)
          </span>
        </a>
      </figcaption>
    </figure>
  );
}
