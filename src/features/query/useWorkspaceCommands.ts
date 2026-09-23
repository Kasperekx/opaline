import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { isDesktopRuntime } from "../../shared/lib/database-api";
import { primaryModifierLabel } from "../../shared/lib/platform";
import type { CommandAction } from "./CommandPalette";
import type { useWorkspace } from "./useWorkspace";
import type { useSqlDocuments } from "./useSqlDocuments";
import type { useSqlCompletions } from "./useSqlCompletions";

type Options = {
  onCloseTab: (id: string) => void;
  onSelectTab: (id: string) => void;
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
  onCloseTab,
  onSelectTab,
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
      label: "Close active tab",
      shortcut: `${primaryModifierLabel} W`,
      disabled: !workspace.tabs.activeTab,
      run: () => {
        if (workspace.tabs.activeTab) onCloseTab(workspace.tabs.activeTab.id);
      },
    },
    {
      label: "Previous tab",
      shortcut: `${primaryModifierLabel} Shift [`,
      run: () => moveTab(-1),
    },
    {
      label: "Next tab",
      shortcut: `${primaryModifierLabel} Shift ]`,
      run: () => moveTab(1),
    },
    { label: "Database diagram", run: () => workspace.tabs.openDiagram() },
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
    { label: "Bookmarks", run: onOpenLibrary },
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
  function moveTab(direction: number) {
    const tabs = workspace.tabs.tabs;
    const index = tabs.findIndex(
      (tab) => tab.id === workspace.tabs.activeTab?.id,
    );
    if (tabs.length)
      onSelectTab(tabs[(index + direction + tabs.length) % tabs.length].id);
  }
  const commandsRef = useRef({ commands, onOpenCommands });
  commandsRef.current = { commands, onOpenCommands };
  useEffect(() => {
    if (!active) return;
    const handle = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const closing =
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "w";
      const bracket =
        event.code === "BracketLeft" || event.key === "[" || event.key === "{"
          ? -1
          : event.code === "BracketRight" ||
              event.key === "]" ||
              event.key === "}"
            ? 1
            : 0;
      const switching = modifier && event.shiftKey && !event.altKey && bracket;
      if (closing || switching) {
        event.preventDefault();
        event.stopPropagation();
        if (
          event.isComposing ||
          event.repeat ||
          document.querySelector(
            'dialog[open], [role="dialog"], [role="alertdialog"]',
          )
        )
          return;
        commandsRef.current.commands
          .find(
            (c) =>
              c.label ===
              (closing
                ? "Close active tab"
                : bracket < 0
                  ? "Previous tab"
                  : "Next tab"),
          )
          ?.run();
        return;
      }
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
    window.addEventListener("keydown", handle, true);
    let disposed = false;
    let stop: (() => void) | undefined;
    if (isDesktopRuntime())
      void listen("request-close-tab", () => {
        if (
          !disposed &&
          !document.querySelector(
            'dialog[open], [role="dialog"], [role="alertdialog"]',
          )
        )
          commandsRef.current.commands
            .find((c) => c.label === "Close active tab")
            ?.run();
      })
        .then((unlisten) => {
          if (disposed) unlisten();
          else stop = unlisten;
        })
        .catch(() => {
          /* Keyboard fallback remains available; never fall back to quitting. */
        });
    return () => {
      disposed = true;
      stop?.();
      window.removeEventListener("keydown", handle, true);
    };
  }, [active]);

  return commands;
}
