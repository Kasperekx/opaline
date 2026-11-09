import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HudProvider, useHud, type HudApi } from "../src/shared/components/Hud";

function Probe({ onHud }: { onHud: (hud: HudApi) => void }) {
  onHud(useHud());
  return null;
}

it("is a safe no-op without a provider so callers keep their inline status", () => {
  let hud: HudApi | null = null;
  render(<Probe onHud={(value) => (hud = value)} />);
  expect(hud!.available).toBe(false);
  expect(() => hud!.show({ title: "Copied cell" })).not.toThrow();
  expect(screen.queryByRole("status")).toBeNull();
});

it("announces politely, replaces the current message and dismisses itself", () => {
  vi.useFakeTimers();
  try {
    let hud: HudApi | null = null;
    render(
      <HudProvider>
        <Probe onHud={(value) => (hud = value)} />
      </HudProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(hud!.available).toBe(true);
    act(() => hud!.show({ title: "Copied cell", tone: "success" }));
    expect(region.textContent).toContain("Copied cell");
    act(() => hud!.show({ title: "Saved 3 changes", detail: "public.users" }));
    // The outgoing capsule crossfades out, hidden from assistive technology.
    const visible = [...region.querySelectorAll(".hud")].filter(
      (capsule) => capsule.getAttribute("aria-hidden") !== "true",
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("Saved 3 changes");
    act(() => vi.advanceTimersByTime(2000));
    expect(region.querySelectorAll(".hud")).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
