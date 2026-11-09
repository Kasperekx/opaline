"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { observeAmbientMotion } from "@/lib/ambient-motion";
import styles from "./product-principles.module.css";

const workspaceSurface =
  "m64 96 109-62q7-4 14 0l109 62q14 8 0 16l-109 63q-7 4-14 0L64 112q-14-8 0-16Z";
const reviewRoute = "M114 222h60q20 0 20-20v-36q0-13 13-13h22";
const keyboardRoutes = [0, 14, 28, 42, 56].map(
  (y) => `M23 ${182 + y}h73q18 0 30-12l90-90q12-12 30-12h89`,
);

function WorkspaceDiagram() {
  return (
    <svg viewBox="0 0 360 280" aria-hidden="true" className={styles.diagram}>
      <path
        className={styles.guide}
        d="M180 19v240M38 143l142 81 142-81M38 100l142 81 142-81"
      />
      {[
        { y: 66, name: "PRODUCTION" },
        { y: 33, name: "STAGING" },
        { y: 0, name: "LOCAL" },
      ].map(({ y, name }, index) => (
        <g key={name} transform={`translate(0 ${y})`}>
          <g className={styles.environmentLayer} data-environment={name}>
            <path
              className={styles.slabSide}
              d="M57 105v17l116 67q7 4 14 0l116-67v-17L180 36z"
            />
            <path
              className={index === 2 ? styles.slabActive : styles.slab}
              d={workspaceSurface}
            />
            {index === 2 && (
              <path className={styles.environmentLight} d={workspaceSurface} />
            )}
            <path
              className={styles.detail}
              d="m81 105 99 57 99-57M180 179v15"
            />
            <g transform="matrix(.866 .5 -.866 .5 177 72)">
              <rect
                x="0"
                y="0"
                width="58"
                height="45"
                rx="4"
                className={styles.dataBlock}
              />
              <path
                d="M12 12h33M12 22h33M12 32h19"
                className={index === 2 ? styles.accent : styles.detail}
              />
            </g>
            <circle
              cx="95"
              cy="105"
              r="2.5"
              className={index === 2 ? styles.accentDot : styles.dot}
            />
          </g>
        </g>
      ))}
      <g className={styles.legend}>
        <path d="M285 175h31M281 209h35M259 242h57" />
        <text x="320" y="178">
          L
        </text>
        <text x="320" y="212">
          S
        </text>
        <text x="320" y="245">
          P
        </text>
      </g>
    </svg>
  );
}

function ChangesDiagram() {
  const id = useId();
  return (
    <svg viewBox="0 0 360 280" aria-hidden="true" className={styles.diagram}>
      <defs>
        <mask
          id={`${id}-review-route`}
          maskUnits="userSpaceOnUse"
          x="100"
          y="140"
          width="140"
          height="90"
        >
          <path d={reviewRoute} stroke="white" strokeWidth="2.5" />
        </mask>
        <linearGradient id={`${id}-review-light`}>
          <stop stopColor="var(--diagram-accent)" stopOpacity="0" />
          <stop offset=".7" stopColor="var(--diagram-accent)" />
          <stop offset="1" stopColor="var(--diagram-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={styles.guide}
        d="m40 210 279-161M40 173l279 0M100 248l0-222M266 248V26"
      />
      <path className={styles.flowPath} d={reviewRoute} />
      <path className={styles.signalPath} d={reviewRoute} />
      <g mask={`url(#${id}-review-route)`}>
        <rect
          x="60"
          y="140"
          width="48"
          height="90"
          fill={`url(#${id}-review-light)`}
          className={styles.reviewImpulse}
        />
      </g>
      <g>
        <path
          className={styles.slabSide}
          d="m48 164 66-38 66 38v35l-66 38-66-38z"
        />
        <path className={styles.slab} d="m48 164 66-38 66 38-66 38z" />
        <path className={styles.detail} d="M114 202v35m-44-35 26 15" />
        <g transform="matrix(.866 .5 -.866 .5 112 145)">
          <path
            className={`${styles.accent} ${styles.editLines}`}
            d="M0 0h29M0 9h29M0 18h18"
          />
          <path className={styles.detail} d="M-12-1v20" />
        </g>
      </g>
      <g>
        <path
          className={styles.slabSide}
          d="m163 97 66-38 66 38v35l-66 38-66-38z"
        />
        <path className={styles.slab} d="m163 97 66-38 66 38-66 38z" />
        <path className={styles.detail} d="M229 135v35m-44-34 26 15" />
        <g transform="matrix(.866 .5 -.866 .5 229 78)">
          <rect
            x="-7"
            y="-5"
            width="31"
            height="40"
            rx="3"
            className={styles.dataBlock}
          />
          <path
            className={`${styles.accent} ${styles.reviewLines}`}
            d="M0 10h16M0 20h10"
          />
        </g>
      </g>
      <g className={styles.saveConfirmation}>
        <path className={styles.checkSurface} d="m196 45 33-19 33 19-33 19Z" />
        <path className={styles.accent} d="m217 43 9 5 16-10" />
        <path className={styles.guide} d="M196 45v33m66-33v33" />
        <path className={styles.saveLight} d="m196 45 33-19 33 19-33 19Z" />
      </g>
      <g className={styles.stepLabels}>
        <text x="42" y="265">
          01 EDIT
        </text>
        <text x="140" y="265">
          02 REVIEW
        </text>
        <text x="260" y="265">
          03 SAVE
        </text>
      </g>
    </svg>
  );
}

function FlowDiagram() {
  const id = useId();
  return (
    <svg viewBox="0 0 360 280" aria-hidden="true" className={styles.diagram}>
      <defs>
        <mask
          id={`${id}-keyboard-routes`}
          maskUnits="userSpaceOnUse"
          x="20"
          y="60"
          width="320"
          height="190"
        >
          {keyboardRoutes.map((route) => (
            <path key={route} d={route} stroke="white" strokeWidth="2" />
          ))}
        </mask>
        <linearGradient id={`${id}-keyboard-light`}>
          <stop stopColor="var(--diagram-accent)" stopOpacity="0" />
          <stop offset=".8" stopColor="var(--diagram-accent)" />
          <stop offset="1" stopColor="var(--diagram-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={styles.parallelPaths}>
        {keyboardRoutes.map((route) => (
          <path key={route} d={route} />
        ))}
      </g>
      <g className={styles.flowHighlight}>
        <path
          className={styles.accent}
          d="M23 210h73q18 0 30-12l90-90q12-12 30-12h89"
        />
        <circle
          cx="329"
          cy="96"
          r="3"
          className={`${styles.accentDot} ${styles.resultLight}`}
        />
      </g>
      <g mask={`url(#${id}-keyboard-routes)`}>
        <rect
          x="-90"
          y="60"
          width="90"
          height="190"
          fill={`url(#${id}-keyboard-light)`}
          className={styles.keyboardImpulse}
        />
      </g>
      <g className={styles.commandKey}>
        <path
          className={styles.slabSide}
          d="m61 133 49-28 49 28v22l-49 28-49-28z"
        />
        <path className={styles.slab} d="m61 133 49-28 49 28-49 28z" />
        <path className={styles.detail} d="M110 161v22" />
        <g transform="matrix(.866 .5 -.866 .5 110 120)">
          <path
            className={styles.keySymbol}
            d="M4 5H-6a5 5 0 1 1 5-5v20a5 5 0 1 1-5-5h20a5 5 0 1 1-5 5V0a5 5 0 1 1 5 5H4Z"
          />
        </g>
      </g>
      <g className={styles.returnKey}>
        <path
          className={styles.slabSide}
          d="m166 72 49-28 49 28v22l-49 28-49-28z"
        />
        <path className={styles.slabActive} d="m166 72 49-28 49 28-49 28z" />
        <path className={styles.detail} d="M215 100v22" />
        <g transform="matrix(.866 .5 -.866 .5 215 64)">
          <path className={styles.keySymbol} d="M14-5v16H-9m7-7-7 7 7 7" />
        </g>
      </g>
      <g className={styles.flowMarks}>
        <path d="M23 205v10m8-10v10m291-52h13m-13 7h13m-13 7h8" />
        <text x="227" y="236">
          SWITCH TABS.
        </text>
        <text x="227" y="252">
          RUN QUERIES.
        </text>
      </g>
    </svg>
  );
}

const principles = [
  {
    title: "Organize your connections",
    description:
      "Group connections by project. Label each environment. Switch between sessions without losing your open queries.",
    Diagram: WorkspaceDiagram,
  },
  {
    title: "Review before saving",
    description:
      "Edit cells in place, review the changes, then save. Nothing from a table edit reaches your database until you apply it.",
    Diagram: ChangesDiagram,
  },
  {
    title: "Work from the keyboard",
    description:
      "Move between queries, tables, and diagrams. Run SQL and switch tabs with the keyboard, without leaving your workspace.",
    Diagram: FlowDiagram,
  },
];

export function ProductPrinciples() {
  const container = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof observeAmbientMotion>[]>([]);
  const [paused, setPaused] = useState(false);
  const id = useId();

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    // Track each SVG independently so offscreen mobile figures stay paused.
    motion.current = Array.from(root.querySelectorAll("article")).map(
      (article) =>
        observeAmbientMotion(
          article,
          undefined,
          article.querySelector("svg") ?? article,
        ),
    );
    root.toggleAttribute(
      "data-managed",
      Boolean(root.querySelector("[data-managed]")),
    );
    return () => {
      motion.current.forEach((controller) => controller.destroy());
      motion.current = [];
      root.removeAttribute("data-managed");
    };
  }, []);

  useEffect(() => {
    motion.current.forEach((controller) => controller.setPaused(paused));
  }, [paused]);

  return (
    <div className={styles.motionSection} ref={container}>
      <button
        type="button"
        className={styles.motionControl}
        aria-label={
          paused ? "Resume feature animations" : "Pause feature animations"
        }
        aria-controls={id}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? (
          <Play size={12} aria-hidden="true" />
        ) : (
          <Pause size={12} aria-hidden="true" />
        )}
        {paused ? "Resume motion" : "Pause motion"}
      </button>
      <div className={styles.principles} id={id}>
        {principles.map(({ title, description, Diagram }, index) => (
          <article key={title} className={styles.principle}>
            <span className={styles.figure}>FIG. 0{index + 1}</span>
            <div className={styles.visual}>
              <Diagram />
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
