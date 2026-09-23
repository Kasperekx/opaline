import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type MenuAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};

/** Shared desktop overflow menu; never removes an action at narrow widths. */
export function ActionMenu({
  label,
  actions,
  disabled = false,
}: {
  label: string;
  actions: MenuAction[];
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const popup = menu.current.getBoundingClientRect();
    setPosition({
      top: Math.max(
        8,
        Math.min(anchor.bottom + 6, window.innerHeight - popup.height - 8),
      ),
      left: Math.max(
        8,
        Math.min(
          anchor.right - popup.width,
          window.innerWidth - popup.width - 8,
        ),
      ),
    });
    menu.current
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        (menu.current?.contains(event.target) ||
          trigger.current?.contains(event.target))
      )
        return;
      setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="icon-button action-menu-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            className="desktop-action-menu"
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (event.key === "Tab") {
                event.preventDefault();
                close();
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ) ?? [],
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            {actions.map(
              ({
                label: actionLabel,
                icon: Icon,
                onSelect,
                disabled: inactive,
                danger,
                separator,
              }) => (
                <button
                  key={actionLabel}
                  role="menuitem"
                  tabIndex={-1}
                  disabled={inactive}
                  className={
                    (danger ? "danger " : "") +
                    (separator ? "menu-separator" : "")
                  }
                  onClick={() => {
                    close();
                    onSelect();
                  }}
                >
                  <Icon size={16} />
                  <span>{actionLabel}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
