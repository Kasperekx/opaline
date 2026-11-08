"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { animateHero } from "@/lib/hero-motion";
import styles from "./hero-aperture.module.css";

export function HeroMotion({ children }: { children: ReactNode }) {
  const aperture = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof animateHero>>(undefined);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!aperture.current || !plane.current) return;
    motion.current = animateHero(aperture.current, plane.current);
    return () => motion.current?.destroy();
  }, []);

  return (
    <>
      <div ref={aperture} className={styles.aperture} aria-hidden="true">
        <div ref={plane} className={styles.parallax}>
          <div className={styles.drift}>{children}</div>
        </div>
        <div className={styles.vignette} />
      </div>
      <button
        className={styles.motionControl}
        type="button"
        aria-label={
          paused ? "Resume background animation" : "Pause background animation"
        }
        onClick={() => {
          motion.current?.setPaused(!paused);
          setPaused(!paused);
        }}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
        {paused ? "Resume motion" : "Pause motion"}
      </button>
    </>
  );
}
