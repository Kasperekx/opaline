"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import { observeAmbientMotion } from "@/lib/ambient-motion";
import styles from "./developer-workflow.module.css";

// Matches the fixed macOS bindings in useWorkspaceCommands and SqlEditor.
const shortcuts = [
  {
    action: "Find a command",
    detail: "One palette. Your next move.",
    label: "Command Shift P",
    keys: ["⌘", "⇧", "P"],
    names: ["command", "shift", "P"],
  },
  {
    action: "Switch tabs",
    detail: "Keep every query within reach.",
    label: "Command Shift Right bracket",
    keys: ["⌘", "⇧", "]"],
    names: ["command", "shift", "]"],
  },
  {
    action: "Run your query",
    detail: "From SQL to results.",
    label: "Command Enter",
    keys: ["⌘", "↵"],
    names: ["command", "return"],
  },
];

export function DeveloperWorkflow() {
  const root = useRef<HTMLElement>(null);
  const motion = useRef<ReturnType<typeof observeAmbientMotion>>(undefined);
  const [paused, setPaused] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!root.current) return;
    motion.current = observeAmbientMotion(root.current);
    return () => motion.current?.destroy();
  }, []);

  return (
    <article
      ref={root}
      className={`chapter ${styles.section}`}
      id="developer-workflow"
      aria-labelledby="developer-title"
    >
      <div className="chapter-rail">
        <span>WORKSPACE / 02</span>
        <span>THINK IT. KEY IT. DONE.</span>
      </div>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <p className="eyebrow">BUILT FOR DEVELOPERS</p>
          <h2 id="developer-title">
            Less clicking.
            <br />
            <span>More momentum.</span>
          </h2>
          <p className={styles.description}>
            Your database workflow, fluent in shortcuts. Find a command, switch
            tabs, and run SQL without reaching for the mouse. Stay with the
            problem. Your hands know the way.
          </p>
          <ol
            className={styles.shortcuts}
            aria-label="macOS keyboard shortcuts"
          >
            {shortcuts.map(({ action, keys, label }, index) => (
              <li key={action} className={styles.step} data-step={index}>
                <span className={styles.stepNumber}>0{index + 1}</span>
                <span>{action}</span>
                <span className={styles.keyCombination} aria-label={label}>
                  {keys.map((key) => (
                    <kbd key={key} aria-hidden="true">
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.subtext}>
            Shortcuts could be assigned to any action in the app.
          </p>
          <a className="text-link" href="#product">
            Explore the workspace <ArrowRight size={15} />
          </a>
        </div>
        <figure className={styles.figure}>
          <div className={styles.artwork}>
            <div className={styles.annotation} aria-hidden="true">
              <span>INPUT → ACTION</span>
              <span>⌘ / OPALINE</span>
            </div>
            <svg
              viewBox="0 0 600 400"
              aria-hidden="true"
              className={styles.keyboard}
            >
              <defs>
                <linearGradient id={`${id}-face`} x2=".25" y2="1">
                  <stop stopColor="#373735" />
                  <stop offset="1" stopColor="#1c1d1e" />
                </linearGradient>
                <linearGradient id={`${id}-side`} x2="0" y2="1">
                  <stop stopColor="#232425" />
                  <stop offset="1" stopColor="#0c0d0e" />
                </linearGradient>
                <linearGradient id={`${id}-light`}>
                  <stop stopColor="#dfbb79" stopOpacity="0" />
                  <stop offset=".8" stopColor="#f8dba5" />
                  <stop offset="1" stopColor="#dfbb79" stopOpacity="0" />
                </linearGradient>
                <mask id={`${id}-route`}>
                  <path
                    d="M62 298h122q16 0 28-12l24-24q12-12 28-12h72q16 0 28 12l24 24q12 12 28 12h122"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  />
                </mask>
              </defs>
              <path
                d="M42 82V54h28m460 0h28v28M42 238v28h28m460 0h28v-28"
                className={styles.guides}
              />
              <path
                d="M62 298h122q16 0 28-12l24-24q12-12 28-12h72q16 0 28 12l24 24q12 12 28 12h122"
                className={styles.route}
              />
              <g mask={`url(#${id}-route)`}>
                <rect
                  x="-100"
                  y="240"
                  width="100"
                  height="65"
                  fill={`url(#${id}-light)`}
                  className={styles.impulse}
                />
              </g>
              {shortcuts.map(({ action, detail, keys, names }, index) => (
                <g key={action} className={styles.scene} data-step={index}>
                  <g transform="matrix(.94 -.13 .25 .84 -13 56)">
                    {keys.map((key, keyIndex) => {
                      const x =
                        keys.length === 2
                          ? 145 + keyIndex * 158
                          : 74 + keyIndex * 162;
                      const width =
                        keys.length === 2 && keyIndex === 1 ? 182 : 128;
                      return (
                        <g key={key} transform={`translate(${x} 92)`}>
                          <rect
                            x="-2"
                            y="14"
                            width={width + 4}
                            height="128"
                            rx="19"
                            className={styles.keyShadow}
                          />
                          <g
                            className={styles.keyPress}
                            style={{ animationDelay: `${keyIndex * 60}ms` }}
                          >
                            <rect
                              y="9"
                              width={width}
                              height="128"
                              rx="18"
                              fill={`url(#${id}-side)`}
                              className={styles.keyEdge}
                            />
                            <rect
                              width={width}
                              height="128"
                              rx="18"
                              fill={`url(#${id}-face)`}
                              className={styles.keyEdge}
                            />
                            <rect
                              x="7"
                              y="7"
                              width={width - 14}
                              height="113"
                              rx="13"
                              className={styles.keyInset}
                            />
                            <rect
                              width={width}
                              height="128"
                              rx="18"
                              className={styles.keyLight}
                              style={{ animationDelay: `${keyIndex * 60}ms` }}
                            />
                            <text
                              x={width / 2}
                              y="71"
                              className={styles.keyGlyph}
                            >
                              {key}
                            </text>
                            <text x="18" y="108" className={styles.keyName}>
                              {names[keyIndex]}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                  </g>
                  <text x="300" y="348" className={styles.action}>
                    {action}
                  </text>
                  <text x="300" y="376" className={styles.actionDetail}>
                    {detail}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <figcaption className={styles.caption}>
            <span>Familiar shortcuts. Built into the macOS app.</span>
            <button
              type="button"
              className={styles.motionControl}
              aria-label={
                paused
                  ? "Resume keyboard animation"
                  : "Pause keyboard animation"
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
      </div>
    </article>
  );
}
