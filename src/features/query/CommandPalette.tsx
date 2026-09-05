import { useState } from "react";
import { Search } from "lucide-react";
import { ConnectionDialog } from "../connections/ConnectionDialog";
export type CommandAction = {
  label: string;
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
};
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: CommandAction[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [index, setIndex] = useState(0);
  const visible = commands.filter((command) =>
    command.label.toLowerCase().includes(search.toLowerCase()),
  );
  const run = (command: CommandAction) => {
    if (!command.disabled) {
      onClose();
      command.run();
    }
  };
  return (
    <ConnectionDialog
      title="Commands"
      subtitle="Current connection · no automatic SQL execution"
      onClose={onClose}
    >
      <div
        className="p1-panel"
        onKeyDown={(event) => {
          if (!visible.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex(
              (index + (event.key === "ArrowDown" ? 1 : visible.length - 1)) %
                visible.length,
            );
          }
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            run(visible[index] ?? visible[0]);
          }
        }}
      >
        <label className="p1-search">
          <Search size={17} />
          <input
            data-initial-focus="true"
            aria-label="Find command"
            aria-controls="command-list"
            aria-activedescendant={
              visible[index] ? `command-${index}` : undefined
            }
            role="combobox"
            aria-expanded="true"
            placeholder="What would you like to do?"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setIndex(0);
            }}
          />
        </label>
        <div
          id="command-list"
          role="listbox"
          aria-label="Commands"
          className="p1-list"
        >
          {visible.map((command, i) => (
            <button
              id={`command-${i}`}
              role="option"
              aria-selected={index === i}
              key={command.label}
              disabled={command.disabled}
              className={`p1-command ${i === index ? "selected" : ""}`}
              onClick={() => run(command)}
            >
              <span>{command.label}</span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
        {!visible.length && <p className="p1-muted">No matching commands.</p>}
      </div>
    </ConnectionDialog>
  );
}
