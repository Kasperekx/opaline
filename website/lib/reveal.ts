/** Enhance only offscreen content. Server-rendered content is always readable. */
export function observeReveal(
  element: HTMLElement,
  variant: "content" | "screen",
  delay: number,
) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (
    preference.matches ||
    !window.IntersectionObserver ||
    !element.animate ||
    element.getBoundingClientRect().top < window.innerHeight
  )
    return;

  const animation = element.animate(
    [
      {
        opacity: 0,
        transform:
          variant === "screen"
            ? "perspective(1600px) rotateX(3deg) translateY(24px) scale(.98)"
            : "translateY(16px)",
      },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: variant === "screen" ? 900 : 650,
      delay,
      easing: getComputedStyle(element).getPropertyValue("--ease").trim(),
      fill: "both",
    },
  );
  animation.pause();
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      animation.play();
      observer.disconnect();
    },
    { threshold: 0, rootMargin: "0px 0px 80px 0px" },
  );

  const finish = () => {
    observer.disconnect();
    animation.cancel();
  };
  const reduce = () => {
    if (preference.matches) finish();
  };
  animation.onfinish = finish;
  observer.observe(element);
  // A keyboard user must never focus a hidden or moving link.
  element.addEventListener("focusin", finish);
  preference.addEventListener("change", reduce);
  return () => {
    finish();
    element.removeEventListener("focusin", finish);
    preference.removeEventListener("change", reduce);
  };
}
