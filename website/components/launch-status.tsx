import { Clock3 } from "lucide-react";

export function LaunchStatus({ className = "" }: { className?: string }) {
  return (
    <span
      className={`launch-status ${className}`}
      data-launch-status="coming-soon"
    >
      <Clock3 size={16} aria-hidden="true" />
      Coming soon
    </span>
  );
}
