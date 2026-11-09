/**
 * Mirrors the macOS key-window state onto the document. When the window is
 * inactive, AppKit draws selections and default buttons in grey instead of
 * the accent colour; tokens.css does the same under
 * `:root[data-window-inactive]`. Safe to import more than once.
 */
let installed = false;

export function trackWindowActivity() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const root = document.documentElement;
  const update = () => {
    if (document.hasFocus()) delete root.dataset.windowInactive;
    else root.dataset.windowInactive = "";
  };
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  update();
}
