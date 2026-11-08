import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { X, type LucideIcon } from "lucide-react";
import "../../styles/sheet.css";

export type SheetTone =
  "accent" | "warning" | "danger" | "local" | "staging" | "production";

/** small 480 · medium 640 · large 960, or a custom width in px. */
export type SheetSize = "small" | "medium" | "large" | number;

export interface SheetProps {
  title: string;
  /** Secondary line under the title; also the dialog's accessible description. */
  subtitle?: ReactNode;
  /** Leading icon tile (a lucide icon component). */
  icon?: LucideIcon;
  tone?: SheetTone;
  /** Trailing header control, such as a segmented mode switch. */
  accessory?: ReactNode;
  size?: SheetSize;
  /** Hide the X visually. It stays available to assistive technology, so
   * only hide it when the footer has its own Close/Cancel. */
  showClose?: boolean;
  busy?: boolean;
  onClose: () => void;
  /** Trailing actions: secondary first, primary last. */
  footer?: ReactNode;
  /** Leading footer content: a Back button or a quiet note. */
  footerStart?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A modal sheet on a native <dialog>: showModal focus trap, Escape (blocked
 * while busy), initial focus via data-initial-focus and focus restoration. */
export function Sheet({
  title,
  subtitle,
  icon: Icon,
  tone = "accent",
  accessory,
  size = "medium",
  showClose = true,
  busy = false,
  onClose,
  footer,
  footerStart,
  className = "",
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus="true"]')?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  // Callers unmount sheets outright, so the exit transition plays on a
  // detached, inert copy while the real dialog is already gone.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    return () => {
      if (!dialog.open) return;
      if (!parseFloat(getComputedStyle(dialog).transitionDuration)) return;
      const scrollTop = dialog.scrollTop;
      queueMicrotask(() => {
        if (!dialog.isConnected) playExit(dialog, scrollTop);
      });
    };
  }, []);
  const named = typeof size === "string";
  return (
    <dialog
      ref={ref}
      className={`sheet${named ? ` sheet-${size}` : ""} ${className}`}
      style={
        named ? undefined : ({ "--sheet-width": `${size}px` } as CSSProperties)
      }
      aria-labelledby={titleId}
      aria-describedby={subtitle ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="sheet-header">
        {Icon && (
          <span className="sheet-icon" data-tone={tone} aria-hidden="true">
            <Icon size={22} strokeWidth={1.6} />
          </span>
        )}
        <div className="sheet-title">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p id={descriptionId}>{subtitle}</p>}
        </div>
        {accessory && <div className="sheet-accessory">{accessory}</div>}
        <button
          type="button"
          className={
            showClose ? "icon-button subtle sheet-close" : "sheet-close sr-only"
          }
          tabIndex={showClose ? undefined : -1}
          disabled={busy}
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      {children}
      {(footer || footerStart) && (
        <SheetFooter start={footerStart}>{footer}</SheetFooter>
      )}
    </dialog>
  );
}

/** The sheet's action row. Use it directly when the actions must live inside
 * a <form> (submit buttons); otherwise pass `footer` to Sheet. */
export function SheetFooter({
  start,
  className = "",
  children,
}: {
  start?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <footer className={`sheet-footer ${className}`}>
      {start && <div className="sheet-footer-start">{start}</div>}
      {children}
    </footer>
  );
}

function playExit(dialog: HTMLDialogElement, scrollTop: number) {
  const ghost = dialog.cloneNode(true) as HTMLDialogElement;
  ghost.removeAttribute("open");
  ghost.removeAttribute("aria-labelledby");
  ghost.removeAttribute("aria-describedby");
  ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  ghost.inert = true;
  // Appear already open: no entrance, then transition to the closed state.
  ghost.classList.add("sheet-ghost");
  const focused = document.activeElement;
  document.body.append(ghost);
  ghost.showModal();
  ghost.scrollTop = scrollTop;
  void getComputedStyle(ghost).opacity;
  ghost.classList.remove("sheet-ghost");
  ghost.close();
  if (focused instanceof HTMLElement && document.activeElement !== focused)
    focused.focus();
  const remove = () => ghost.remove();
  ghost.addEventListener("transitionend", (event) => {
    if (event.target === ghost && event.propertyName === "opacity") remove();
  });
  window.setTimeout(remove, 400);
}
