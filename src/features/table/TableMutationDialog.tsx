import { Loader2, type LucideIcon } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

type TableMutationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  Icon: LucideIcon;
  busy: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
  error?: string | null;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TableMutationDialog({
  open,
  title,
  description,
  confirmLabel,
  Icon,
  busy,
  confirmDisabled,
  danger,
  error,
  children,
  onCancel,
  onConfirm,
}: TableMutationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  if (!open) return null;

  return (
    <div
      className="row-delete-layer"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
        if (event.key !== "Tab") return;
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={`row-delete-confirm table-mutation-dialog ${danger ? "danger" : ""}`}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="table-mutation-heading">
          <Icon size={17} />
          <span>
            <strong id={titleId}>{title}</strong>
            {description}
          </span>
        </div>
        {children}
        {error && (
          <div className="table-mutation-error" role="alert">
            {error}
          </div>
        )}
        <div className="table-mutation-actions">
          <button
            type="button"
            autoFocus={!children}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "danger" : "primary"}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy && <Loader2 className="spin" size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
