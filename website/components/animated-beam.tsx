"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Database, Pause, Play } from "lucide-react";
import { observeAmbientMotion } from "@/lib/ambient-motion";
import styles from "./providers.module.css";

const upcoming = [
  {
    name: "MySQL",
    logo: null,
    x: 534,
    y: 50,
    path: "M173 195C298 156 388 54 500 50",
  },
  {
    name: "SQLite",
    logo: "sqlite",
    x: 534,
    y: 430,
    path: "M173 245C298 300 388 426 500 430",
  },
];

/** A moving gradient, masked to a fixed path: only its transform animates. */
function Beam({ path, reverse = false }: { path: string; reverse?: boolean }) {
  const id = useId();
  return (
    <g>
      <defs>
        <mask
          id={`${id}-path`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="640"
          height="500"
        >
          <path d={path} fill="none" stroke="white" strokeWidth="2" />
        </mask>
        <linearGradient id={`${id}-light`}>
          <stop stopColor="#dfbb79" stopOpacity="0" />
          <stop offset=".65" stopColor="#dfbb79" />
          <stop offset=".85" stopColor="#ffedc7" />
          <stop offset="1" stopColor="#dfbb79" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path} className={styles.track} />
      <g mask={`url(#${id}-path)`}>
        <rect
          x="-160"
          y="0"
          width="160"
          height="500"
          fill={`url(#${id}-light)`}
          className={`${styles.beam} ${reverse ? styles.returnBeam : ""}`}
        />
      </g>
    </g>
  );
}

export function AnimatedBeam() {
  const figure = useRef<HTMLElement>(null);
  const motion = useRef<ReturnType<typeof observeAmbientMotion> | undefined>(
    undefined,
  );
  const [paused, setPaused] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!figure.current) return;
    motion.current = observeAmbientMotion(figure.current);
    return () => motion.current?.destroy();
  }, []);

  return (
    <figure ref={figure} className={styles.diagram}>
      <div className={styles.canvas}>
        <svg viewBox="0 0 640 500" role="img" aria-labelledby={titleId}>
          <title id={titleId}>
            Opaline database providers: PostgreSQL is planned for the first
            release. MySQL and SQLite are planned for later releases.
          </title>
          <path className={styles.guide} d="M28 220h584M126 18v386" />
          {upcoming.map(({ name, path }) => (
            <path key={name} d={path} className={styles.plannedTrack} />
          ))}
          <Beam path="M180 210 C294 168 378 168 493 210" />
          <Beam path="M180 230 C294 272 378 272 493 230" reverse />
          <g className={styles.node}>
            <circle cx="126" cy="220" r="66" className={styles.nodeRing} />
            <circle cx="126" cy="220" r="54" />
            <circle cx="125" cy="221" r="24" className={styles.opalineMark} />
            <circle cx="146" cy="200" r="7" className={styles.opalineAccent} />
          </g>
          <g className={`${styles.node} ${styles.availableNode}`}>
            <circle cx="534" cy="220" r="52" className={styles.nodeRing} />
            <circle cx="534" cy="220" r="42" />
            <image
              href="/providers/postgresql.svg"
              x="510"
              y="194"
              width="48"
              height="52"
            />
          </g>
          {upcoming.map(({ name, logo, x, y }) => (
            <g key={name} className={`${styles.node} ${styles.plannedNode}`}>
              <circle cx={x} cy={y} r="34" />
              {logo ? (
                <image
                  href={`/providers/${logo}.svg`}
                  x={x - 28}
                  y={y - 28}
                  width="56"
                  height="56"
                />
              ) : (
                <Database
                  x={x - 18}
                  y={y - 18}
                  width="36"
                  height="36"
                  className={styles.genericProvider}
                />
              )}
            </g>
          ))}
        </svg>
        <div
          className={`${styles.nodeLabel} ${styles.clientLabel}`}
          aria-hidden="true"
        >
          <strong>Opaline</strong>
          <span>Your workspace</span>
        </div>
        <div
          className={`${styles.nodeLabel} ${styles.providerLabel}`}
          aria-hidden="true"
        >
          <strong>PostgreSQL</strong>
          <span>At launch</span>
        </div>
        {upcoming.map(({ name, x, y }) => (
          <div
            key={name}
            className={`${styles.nodeLabel} ${styles.plannedLabel}`}
            style={{
              left: `${(x / 640) * 100}%`,
              top: `${((y + 44) / 500) * 100}%`,
            }}
            aria-hidden="true"
          >
            <strong>{name}</strong>
            <span>Coming soon</span>
          </div>
        ))}
      </div>
      <figcaption className={styles.diagramCaption}>
        <span>Desktop app coming soon. More providers to follow.</span>
        <button
          className={styles.motionControl}
          type="button"
          aria-label={
            paused
              ? "Resume connection animation"
              : "Pause connection animation"
          }
          onClick={() => {
            motion.current?.setPaused(!paused);
            setPaused(!paused);
          }}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "Resume" : "Pause"}
        </button>
      </figcaption>
    </figure>
  );
}
