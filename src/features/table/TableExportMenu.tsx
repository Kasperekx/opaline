import {
  ChevronDown,
  Download,
  FileJson2,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TableExportFormat } from "./table-export";

type TableExportMenuProps = {
  disabled: boolean;
  busy: boolean;
  rowCount: number;
  selectedCount: number;
  onExport: (format: TableExportFormat) => void;
  onExportAll: (format: TableExportFormat) => void;
};

const formats = [
  {
    id: "csv" as const,
    label: "CSV",
    description: "Spreadsheet-friendly",
    Icon: FileSpreadsheet,
  },
  {
    id: "json" as const,
    label: "JSON",
    description: "Structured records",
    Icon: FileJson2,
  },
];

export function TableExportMenu({
  disabled,
  busy,
  rowCount,
  selectedCount,
  onExport,
  onExportAll,
}: TableExportMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const scope =
    selectedCount > 0
      ? `${selectedCount} selected`
      : `${rowCount} on this page`;

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="table-export-menu">
      <button
        ref={triggerRef}
        type="button"
        aria-label={busy ? "Exporting table data" : "Export table data"}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled || busy}
        onClick={() => setOpen((current) => !current)}
      >
        {busy ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
        <span>{busy ? "Exporting" : "Export"}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="table-export-popover"
          role="menu"
          aria-label="Export format"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const items = [
              ...(popoverRef.current?.querySelectorAll<HTMLButtonElement>(
                "button",
              ) ?? []),
            ];
            if (items.length === 0) return;
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (event.key === "Home") items[0].focus();
            else if (event.key === "End") items[items.length - 1].focus();
            else {
              const delta = event.key === "ArrowDown" ? 1 : -1;
              items[(current + delta + items.length) % items.length].focus();
            }
          }}
        >
          <div>
            <strong>Quick export</strong>
            <span>{scope}</span>
          </div>
          {formats.map(({ id, label, description, Icon }) => (
            <button
              type="button"
              role="menuitem"
              key={id}
              onClick={() => {
                setOpen(false);
                onExport(id);
              }}
            >
              <Icon size={16} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
          <div className="table-export-section">
            <strong>Full result</strong>
            <span>Runs in background</span>
          </div>
          {formats.map(({ id, label, Icon }) => (
            <button
              type="button"
              role="menuitem"
              className="full-export-option"
              key={`all-${id}`}
              onClick={() => {
                setOpen(false);
                onExportAll(id);
              }}
            >
              <Icon size={16} />
              <span>
                <strong>All rows · {label}</strong>
                <small>Streams every matching row</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
