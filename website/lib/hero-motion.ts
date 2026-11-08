import { observeAmbientMotion } from "./ambient-motion.ts";

/** CSS owns the ambient loop; the spring wakes only while the pointer settles. */
export function animateHero(aperture: HTMLElement, plane: HTMLElement) {
  const scene = aperture.parentElement;
  if (!scene || !window.IntersectionObserver) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let active = false,
    frame = 0,
    previous = 0;
  let x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    targetX = 0,
    targetY = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = previous = 0;
    vx = vy = 0;
  };
  const reset = () => {
    stop();
    x = y = targetX = targetY = 0;
    plane.style.transform = "";
  };
  const resetForPreference = () => {
    if (reduced.matches || !fine.matches) reset();
  };
  const tick = (time: number) => {
    // Cap elapsed time after a slow frame; never catch up with a large jump.
    const dt = previous ? Math.min((time - previous) / 1000, 1 / 30) : 1 / 60;
    previous = time;
    // Mass 1, stiffness 100, damping 10: the shared design-engineering spring.
    vx += ((targetX - x) * 100 - vx * 10) * dt;
    vy += ((targetY - y) * 100 - vy * 10) * dt;
    x += vx * dt;
    y += vy * dt;
    const settled =
      Math.abs(targetX - x) +
        Math.abs(targetY - y) +
        Math.abs(vx) +
        Math.abs(vy) <
      0.02;
    if (settled) {
      x = targetX;
      y = targetY;
    }
    plane.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)`;
    if (settled) {
      frame = previous = 0;
    } else {
      frame = requestAnimationFrame(tick);
    }
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const move = (event: PointerEvent) => {
    if (!active || !fine.matches || event.pointerType !== "mouse") return;
    const bounds = scene.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const normalize = (value: number) =>
      Math.max(-1, Math.min(1, value * 2 - 1));
    targetX = normalize((event.clientX - bounds.left) / bounds.width) * 7;
    targetY = normalize((event.clientY - bounds.top) / bounds.height) * 5;
    wake();
  };
  const leave = () => {
    targetX = targetY = 0;
    if (active && fine.matches) wake();
  };
  const ambient = observeAmbientMotion(
    aperture,
    (value) => {
      active = value;
      if (!active) stop();
      resetForPreference();
    },
    scene,
  );
  fine.addEventListener("change", resetForPreference);
  scene.addEventListener("pointermove", move, { passive: true });
  scene.addEventListener("pointerleave", leave);
  // Keyboard focus must not acquire a mouse-driven offset.
  scene.addEventListener("focusin", reset);
  return {
    setPaused: ambient.setPaused,
    destroy() {
      ambient.destroy();
      fine.removeEventListener("change", resetForPreference);
      scene.removeEventListener("pointermove", move);
      scene.removeEventListener("pointerleave", leave);
      scene.removeEventListener("focusin", reset);
      reset();
    },
  };
}
