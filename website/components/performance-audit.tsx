"use client";

import { useReportWebVitals } from "next/web-vitals";

// Opt-in local diagnostics only. No analytics endpoint or visitor identifiers.
const report: Parameters<typeof useReportWebVitals>[0] = ({
  name,
  value,
  rating,
}) => {
  console.info(
    "[opaline:performance]",
    JSON.stringify({ name, value, rating }),
  );
};

export function PerformanceAudit() {
  useReportWebVitals(report);
  return null;
}
