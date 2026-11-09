import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

/** Matches the floating bars' exit transition (inline-editing.css). */
export const FLOATING_EXIT_MS = 150;

/**
 * Keeps a floating bar mounted for its exit so it can leave instead of
 * vanishing. While leaving it is frozen on the last state it showed and
 * receives `leaving`, which the bar maps to `data-leaving` and `inert`.
 * Showing it again mid-exit simply reverses the transition.
 */
export function FloatingPresence({
  show,
  children,
}: {
  show: boolean;
  children: ReactElement<{ leaving?: boolean }>;
}) {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);
  useEffect(() => {
    if (show || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), FLOATING_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [show, mounted]);
  const last = useRef<ReactElement<{ leaving?: boolean }> | null>(null);
  if (show) last.current = children;
  if (!mounted || !last.current) return null;
  return show ? last.current : cloneElement(last.current, { leaving: true });
}
