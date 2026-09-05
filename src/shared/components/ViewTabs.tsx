import type { LucideIcon } from "lucide-react";

type ViewTab<T extends string> = {
  id: T;
  label: string;
  Icon: LucideIcon;
  count?: number;
};

type ViewTabsProps<T extends string> = {
  id: string;
  label: string;
  tabs: ViewTab<T>[];
  active: T;
  onChange: (id: T) => void;
};

export function ViewTabs<T extends string>({
  id,
  label,
  tabs,
  active,
  onChange,
}: ViewTabsProps<T>) {
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {tabs.map(({ id: value, label: title, Icon, count }, index) => (
        <button
          type="button"
          role="tab"
          key={value}
          id={`${id}-tab-${value}`}
          aria-controls={`${id}-panel-${value}`}
          aria-selected={active === value}
          tabIndex={active === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft")
              next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next].id);
            const button = event.currentTarget.parentElement?.children[
              next
            ] as HTMLElement;
            button?.focus();
            button?.scrollIntoView({ block: "nearest", inline: "nearest" });
          }}
        >
          <Icon size={15} />
          <span>{title}</span>
          {count !== undefined && <small>{count}</small>}
        </button>
      ))}
    </div>
  );
}
