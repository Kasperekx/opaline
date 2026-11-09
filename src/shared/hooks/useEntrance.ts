import { useEffect, useState, type AnimationEvent } from "react";

/**
 * Entrance motion that plays once, when the element first mounts.
 *
 * CSS animations restart whenever an ancestor goes from `display: none` back
 * to visible — here, every tab or session switch. Switching must stay
 * instant, so styles animate only `[data-entering]`, which this hook removes
 * when the entrance finishes (or after a short fallback if it never runs,
 * e.g. the element was hidden mid-animation).
 */
export function useEntrance(fallbackMs = 600) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setEntering(false), fallbackMs);
    return () => window.clearTimeout(timer);
  }, [entering, fallbackMs]);
  return {
    "data-entering": entering ? "" : undefined,
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setEntering(false);
    },
  };
}
