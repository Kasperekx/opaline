import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { isDesktopRuntime } from "../../shared/lib/database-api";
import { primaryModifierLabel } from "../../shared/lib/platform";
import { databaseObjectKey } from "../../shared/lib/database-object";
import { useOptionalDatabaseSession } from "../connections/SessionContext";
import {
  requestPaletteScope,
  type CommandAction,
} from "./command-palette-model";
import { useSavedQueries } from "./useSavedQueries";
import type { useWorkspace } from "./useWorkspace";
import type { useSqlDocuments } from "./useSqlDocuments";
import type { useSqlCompletions } from "./useSqlCompletions";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
/** Planner estimates, like the explorer: 2,184 · 48.3K · 1.2M. */
const formatRows = (rows: number) =>
  rows < 10_000 ? rows.toLocaleString("en-US") : compactNumber.format(rows);
const objectId = (schema: string, name: string) =>
  `object:${databaseObjectKey({ schema, name })}`;
type Memory = Map<string, { last: number; uses: number }>;

type Options = {
  onCloseTab: (id: string) => void;
  onSelectTab: (id: string) => void;
  active: boolean;
  hasQuery: boolean;
  workspace: Pick<ReturnType<typeof useWorkspace>, "tabs" | "refreshObjects"> &
    Partial<Pick<ReturnType<typeof useWorkspace>, "objects" | "selectObject">>;
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
  // Palette memory lives for this session only: tables opened (from any
  // path) and items run from the palette, for the empty-query list.
  const memory = useRef<Memory>(new Map());
  const [memoryVersion, bumpMemory] = useReducer((n: number) => n + 1, 0);
  const remember = useCallback((id: string) => {
    const entry = memory.current.get(id);
    memory.current.set(id, { last: Date.now(), uses: (entry?.uses ?? 0) + 1 });
    bumpMemory();
  }, []);
  const activeTab = workspace.tabs.activeTab;
  const activeTableId =
    activeTab && "kind" in activeTab && activeTab.kind === "table"
      ? objectId(activeTab.schema, activeTab.table)
      : null;
  useEffect(() => {
    if (activeTableId) remember(activeTableId);
  }, [activeTableId, remember]);

  const actions = useRef({
    selectObject: workspace.selectObject,
    openSchema: workspace.tabs.openSchema,
    addQueryTab: workspace.tabs.addQueryTab,
  });
  actions.current = {
    selectObject: workspace.selectObject,
    openSchema: workspace.tabs.openSchema,
    addQueryTab: workspace.tabs.addQueryTab,
  };
  const objects = workspace.objects;
  const objectItems = useMemo(
    () =>
      (objects ?? []).map((object): CommandAction => {
        const view = object.objectType.includes("view");
        const editable =
          object.objectType === "table" ||
          object.objectType === "partitioned_table";
        return {
          id: objectId(object.schema, object.name),
          label: object.name,
          section: view ? "Views" : "Tables",
          detail: object.schema,
          qualified: `${object.schema}.${object.name}`,
          meta:
            !view && object.estimatedRows > 0
              ? `${formatRows(object.estimatedRows)} rows`
              : undefined,
          // The explorer's open path: selects, opens the tab, never runs SQL.
          run: () => actions.current.selectObject?.(object),
          alternate: editable
            ? {
                label: "Edit structure",
                run: () =>
                  actions.current.openSchema(object.schema, object.name),
              }
            : undefined,
        };
      }),
    [objects],
  );
  const session = useOptionalDatabaseSession();
  const library = useSavedQueries(session?.session.workspaceId ?? "");
  const queryItems = useMemo(
    () =>
      library.entries.map((entry): CommandAction => ({
        id: `query:${entry.id}`,
        label: entry.title,
        section: "Queries",
        detail: entry.sql.replace(/\s+/g, " ").trim().slice(0, 64),
        // Opens an editable copy in a new tab; never executes it.
        run: () => {
          remember(`query:${entry.id}`);
          actions.current.addQueryTab(entry.sql, entry.title);
        },
      })),
    [library.entries, remember],
  );
  const recalled = useMemo(
    () =>
      [...objectItems, ...queryItems].map((item) => {
        const used = memory.current.get(item.id!);
        return used ? { ...item, lastUsed: used.last, uses: used.uses } : item;
      }),
    // memoryVersion invalidates after the in-memory map changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectItems, queryItems, memoryVersion],
  );
  const paletteItems: CommandAction[] = [
    ...commands.map((command) => {
      const used = memory.current.get(command.label);
      return {
        ...command,
        lastUsed: used?.last,
        uses: used?.uses,
        run: () => {
          remember(command.label);
          command.run();
        },
      };
    }),
    ...recalled,
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
      const key = event.key.toLowerCase();
      // Shift+Cmd+P: everything; Shift+Cmd+O (Open Quickly): tables and
      // views. Neither edits text, so they also work from a text field.
      if ((key === "p" || key === "o") && event.shiftKey && !event.altKey) {
        event.preventDefault();
        if (event.repeat) return;
        requestPaletteScope(key === "o" ? "tables" : "all");
        commandsRef.current.onOpenCommands();
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select")
      )
        return;
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

  return paletteItems;
}
