import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render } from "./render-with-safety";
import { ConnectionManager } from "../src/features/connections/ConnectionManager";
import {
  newProfile,
  type ConnectionProfile,
} from "../src/features/connections/connection-types";

const make = (
  id: string,
  name: string,
  environment: ConnectionProfile["environment"] = "local",
): ConnectionProfile => ({
  ...newProfile("mmo"),
  id,
  name,
  environment,
  credentialId: null,
});
const local = make("local", "Local database");
const preview = make("preview", "Preview database");
const staging = make("staging", "Staging database", "staging");

function renderLibrary(busy = false) {
  mockIPC(() => {
    throw new Error("Keyboard navigation must not invoke database commands");
  });
  const onConnect = vi.fn();
  const props = {
    catalog: {
      version: 1,
      workspaces: [{ id: "mmo", name: "MMO" }],
      profiles: [local, preview, staging],
    },
    sessions: [],
    loading: false,
    onCatalog: vi.fn(),
    onConnect,
  };
  const view = render(<ConnectionManager {...props} busy={busy} />);
  return { onConnect, props, view, user: userEvent.setup() };
}
const main = (name: string) =>
  screen.getByRole("button", { name: `View details for ${name}` });
const rowOf = (name: string) => main(name).closest("li")!;

describe("connection library keyboard", () => {
  it("moves one selection with the arrows and connects it with Return", async () => {
    const { user, onConnect } = renderLibrary();
    // The first row takes focus on open, so Return works immediately.
    expect(document.activeElement).toBe(main("Local database"));
    expect(rowOf("Local database").classList).toContain("is-current");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(main("Staging database"));
    expect(rowOf("Staging database").classList).toContain("is-current");
    expect(rowOf("Local database").classList).not.toContain("is-current");
    // Roving tab stop: only the selected row's main button is tabbable.
    expect(main("Local database").tabIndex).toBe(-1);
    expect(main("Staging database").tabIndex).toBe(0);
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(preview);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("jumps to search when typing, clears on Escape, then returns to the list", async () => {
    const { user } = renderLibrary();
    const search = screen.getByRole("textbox", { name: "Search connections" });
    await user.keyboard("stag");
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe("stag");
    expect(screen.queryByText("Local database")).toBeNull();
    await user.keyboard("{Escape}");
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(main("Local database"));
  });

  it("focuses search with Cmd+F and Cmd+K and connects the top match with Return", async () => {
    const { user, onConnect } = renderLibrary();
    const search = screen.getByRole("textbox", { name: "Search connections" });
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(search);
    main("Local database").focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(search);
    await user.type(search, "staging{Enter}");
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(staging);
  });

  it("preselects the last used profile and shows its connecting state", async () => {
    const first = renderLibrary();
    await first.user.click(
      screen.getByRole("button", { name: "Connect to Staging database" }),
    );
    expect(first.onConnect).toHaveBeenCalledWith(staging);
    first.view.rerender(<ConnectionManager {...first.props} busy />);
    const connecting = screen.getByRole("button", {
      name: "Connecting to Staging database",
    });
    expect(connecting.textContent).toBe("Connecting…");
    first.view.rerender(<ConnectionManager {...first.props} busy={false} />);
    expect(
      screen.getByRole("button", { name: "Connect to Staging database" }),
    ).toBeTruthy();
    first.view.unmount();

    renderLibrary();
    expect(rowOf("Staging database").classList).toContain("is-current");
    expect(main("Staging database").tabIndex).toBe(0);
  });
});
