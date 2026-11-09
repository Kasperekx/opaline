import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, MoreHorizontal, type LucideIcon } from "lucide-react";

export type MenuAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  /** Secondary line under the label, e.g. an environment or destination. */
  detail?: string;
  /** Shows a checkmark, like the current item of a macOS menu. */
  checked?: boolean;
  /** Non-interactive section heading rendered above this item. */
  heading?: string;
  /** Visual tint for the icon (environment dots). */
  iconColor?: string;
  key?: string;
};

/** Shared desktop menu; never removes an action at narrow widths. */
export function ActionMenu({
  label,
  actions,
  disabled = false,
  trigger: triggerContent,
  triggerClassName,
  align = "end",
  placement = "below",
}: {
  label: string;
  actions: MenuAction[];
  disabled?: boolean;
  /** Custom trigger content; defaults to an overflow (…) icon button. */
  trigger?: ReactNode;
  triggerClassName?: string;
  /** Edge of the trigger the menu aligns to. */
  align?: "start" | "end";
  /** Opens above the trigger, e.g. from a bar at the bottom of the window. */
  placement?: "below" | "above";
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    transformOrigin: "top right",
  });
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
        Math.min(
          placement === "above"
            ? anchor.top - popup.height - 6
            : anchor.bottom + 6,
          window.innerHeight - popup.height - 8,
        ),
      ),
      left: Math.max(
        8,
        Math.min(
          align === "start" ? anchor.left : anchor.right - popup.width,
          window.innerWidth - popup.width - 8,
        ),
      ),
      transformOrigin:
        (placement === "above" ? "bottom " : "top ") +
        (align === "start" ? "left" : "right"),
    });
    menu.current
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, [open, align, placement]);
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
        className={triggerClassName ?? "icon-button action-menu-trigger"}
        aria-label={label}
        title={triggerContent ? undefined : label}
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
        {triggerContent ?? <MoreHorizontal size={18} />}
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
                detail,
                checked,
                heading,
                iconColor,
                key,
              }) => (
                <div className="menu-entry" key={key ?? actionLabel}>
                  {heading && (
                    <div
                      className={
                        "menu-heading" + (separator ? " menu-separator" : "")
                      }
                      role="presentation"
                    >
                      {heading}
                    </div>
                  )}
                  <button
                    role={checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={checked}
                    tabIndex={-1}
                    disabled={inactive}
                    className={
                      (danger ? "danger " : "") +
                      (separator && !heading ? "menu-separator " : "") +
                      (detail ? "has-detail" : "")
                    }
                    onClick={() => {
                      close();
                      onSelect();
                    }}
                  >
                    <Icon
                      size={15}
                      style={iconColor ? { color: iconColor } : undefined}
                    />
                    <span className="menu-label">
                      <span>{actionLabel}</span>
                      {detail && <small>{detail}</small>}
                    </span>
                    {checked && <Check className="menu-check" size={14} />}
                  </button>
                </div>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
