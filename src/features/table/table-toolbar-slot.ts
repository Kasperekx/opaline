import { createContext } from "react";

/**
 * The table workspace owns one toolbar row (title, Data/Structure switch).
 * The active view renders its own controls into these slots so the switch
 * never moves when the view changes. Without a provider (tests, previews)
 * a view renders a complete toolbar of its own.
 */
export type TableToolbarSlots = {
  subtitle: HTMLElement | null;
  actions: HTMLElement | null;
};

export const TableToolbarSlot = createContext<TableToolbarSlots | null>(null);
