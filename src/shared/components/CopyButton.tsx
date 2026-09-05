import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  return (
    <button
      type="button"
      className="toolbar-button"
      aria-label={status === "error" ? "Copy failed. Try again." : label}
      onClick={async () => {
        window.clearTimeout(timeout.current);
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          setStatus("error");
        }
        timeout.current = window.setTimeout(() => setStatus("idle"), 2000);
      }}
    >
      {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
      <span aria-live="polite">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Retry copy"
            : label}
      </span>
    </button>
  );
}
