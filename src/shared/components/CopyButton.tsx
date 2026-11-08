import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHud } from "./Hud";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const hud = useHud();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  // With a HUD the confirmation is announced there; the button keeps its
  // label and only swaps its glyph, so nothing is read twice.
  const announce = !hud.available;
  return (
    <button
      type="button"
      className="toolbar-button copy-button"
      data-status={status}
      aria-label={status === "error" ? "Copy failed. Try again." : label}
      onClick={async () => {
        window.clearTimeout(timeout.current);
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
          hud.show({
            title: /^Copy\b/.test(label)
              ? label.replace(/^Copy\b/, "Copied")
              : "Copied",
            tone: "success",
          });
        } catch {
          setStatus("error");
        }
        timeout.current = window.setTimeout(() => setStatus("idle"), 2000);
      }}
    >
      {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
      <span aria-live={announce ? "polite" : undefined}>
        {status === "copied" && announce
          ? "Copied"
          : status === "error"
            ? "Retry copy"
            : label}
      </span>
    </button>
  );
}
