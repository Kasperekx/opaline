"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { observeReveal } from "@/lib/reveal";

/** Content stays visible without JavaScript or IntersectionObserver. */
export function Reveal({
  children,
  className = "",
  variant = "content",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  variant?: "content" | "screen";
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) return observeReveal(element, variant, delay);
  }, [variant, delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
