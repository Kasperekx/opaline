import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ProjectLinks } from "../src/shared/components/ProjectLinks";
import capability from "../src-tauri/capabilities/default.json";

it("opens only the exact allowlisted project page, without diagnostic query parameters", async () => {
  const calls = vi.fn();
  mockIPC((command, args) => {
    calls(command, args);
  });
  render(<ProjectLinks />);
  expect(calls).not.toHaveBeenCalled();
  const user = userEvent.setup();
  for (const name of ["Report a bug", "Tester guide"])
    await user.click(screen.getByRole("button", { name }));
  const permission = capability.permissions.find(
    (item) =>
      typeof item === "object" && item.identifier === "opener:allow-open-url",
  );
  if (!permission || typeof permission === "string")
    throw new Error("Missing exact URL permission");
  expect(calls.mock.calls.map((call) => call[1].url)).toEqual(
    permission.allow.map((item) => item.url),
  );
  expect(
    calls.mock.calls.every((call) => call[0] === "plugin:opener|open_url"),
  ).toBe(true);
});

it("shows a usable URL if the system browser cannot be opened", async () => {
  mockIPC(() => {
    throw new Error("No default browser");
  });
  render(<ProjectLinks />);
  await userEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "https://github.com/Kasperekx/opaline/issues/new/choose",
  );
});
