import { useEffect, useRef } from "react";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { CommandAction } from "./CommandPalette";
import type { useWorkspace } from "./useWorkspace";
import type { useSqlDocuments } from "./useSqlDocuments";
import type { useSqlCompletions } from "./useSqlCompletions";

type Options = {
  active: boolean;
  hasQuery: boolean;
  workspace: Pick<ReturnType<typeof useWorkspace>, "tabs" | "refreshObjects">;
  documents: ReturnType<typeof useSqlDocuments>;
  completions: Pick<ReturnType<typeof useSqlCompletions>, "refresh">;
  onSwitchConnection: () => void;
  onOpenLibrary: () => void;
  onOpenHistory: () => void;
  onOpenBackup: () => void;
  onOpenCommands: () => void;
};
export function useWorkspaceCommands({
  active,
  hasQuery,
  workspace,
  documents,
  completions,
  onSwitchConnection,
  onOpenLibrary,
  onOpenHistory,
  onOpenBackup,
  onOpenCommands,
}: Options) {
  const commands: CommandAction[] = [
    {
      label: "New SQL query",
      run: () => {
        workspace.tabs.addQueryTab();
      },
    },
    {
      label: "Open SQL file",
      shortcut: `${primaryModifierLabel} O`,
      disabled: documents.busy,
      run: () => {
        void documents.open();
      },
    },
    {
      label: "Save SQL file",
      shortcut: `${primaryModifierLabel} S`,
      disabled: !hasQuery || documents.busy,
      run: () => {
        void documents.save();
      },
    },
    {
      label: "Save SQL file as…",
      disabled: !hasQuery || documents.busy,
      run: () => {
        void documents.save(true);
      },
    },
    {
      label: "Format SQL",
      disabled: !hasQuery || documents.busy,
      run: () => {
        void documents.format();
      },
    },
    { label: "Query library", run: onOpenLibrary },
    {
      label: "Reopen closed query",
      disabled: !workspace.tabs.canRestore,
      run: workspace.tabs.restoreClosedTab,
    },
    {
      label: "Refresh SQL suggestions and explorer",
      run: () => {
        completions.refresh();
        void workspace.refreshObjects();
      },
    },
    { label: "Switch connection", run: onSwitchConnection },
    { label: "Query history", run: onOpenHistory },
    { label: "Backup / Restore database", run: onOpenBackup },
  ];
  const commandsRef = useRef({ commands, onOpenCommands });
  commandsRef.current = { commands, onOpenCommands };
  useEffect(() => {
    if (!active) return;
    const handle = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select")
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "p" && event.shiftKey) {
        event.preventDefault();
        commandsRef.current.onOpenCommands();
      }
      if ((key === "s" || key === "o") && !event.altKey) {
        event.preventDefault();
        const command = commandsRef.current.commands.find(
          (item) =>
            item.label ===
            (key === "o"
              ? "Open SQL file"
              : event.shiftKey
                ? "Save SQL file as…"
                : "Save SQL file"),
        );
        if (command && !command.disabled) command.run();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [active]);

  return commands;
}
