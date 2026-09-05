import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import { isDesktopRuntime } from "./database-api";

/** Share native dragging across headers without stealing clicks from controls. */
export function handleWindowDrag(event: MouseEvent<HTMLElement>) {
  if (
    !isDesktopRuntime() ||
    event.button !== 0 ||
    (event.target instanceof Element &&
      event.target.closest("button, input, select, a, label, [data-no-drag]"))
  )
    return;
  const window = getCurrentWindow();
  void (
    event.detail === 2 ? window.toggleMaximize() : window.startDragging()
  ).catch(() => undefined);
}
