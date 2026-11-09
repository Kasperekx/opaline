/** Keep decorative CSS loops still until visible, and respect every pause gate. */
export function observeAmbientMotion(
  element: HTMLElement,
  onChange?: (active: boolean) => void,
  target: Element = element,
) {
  const doc = element.ownerDocument;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false,
    paused = false,
    destroyed = false;
  const sync = () => {
    if (destroyed) return;
    const active = visible && !doc.hidden && !reduced.matches && !paused;
    element.toggleAttribute("data-active", active);
    onChange?.(active);
  };
  const observer = window.IntersectionObserver
    ? new window.IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
      })
    : undefined;
  if (observer) {
    observer.observe(target);
    element.setAttribute("data-managed", "");
    doc.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
  }
  sync();

  return {
    setPaused(value: boolean) {
      if (destroyed) return;
      paused = value;
      sync();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      element.removeAttribute("data-active");
      element.removeAttribute("data-managed");
      onChange?.(false);
    },
  };
}
