import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { render } from "./render-with-safety";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ConnectionManager } from "../src/features/connections/ConnectionManager";
import {
  newProfile,
  type ConnectionProfile,
  type SessionInfo,
} from "../src/features/connections/connection-types";

const profile: ConnectionProfile = {
  ...newProfile("mmo"),
  id: "local",
  name: "Local database",
  credentialId: null,
};
const catalog = {
  version: 1,
  workspaces: [{ id: "mmo", name: "MMO" }],
  profiles: [profile],
};

function renderHome(
  options: {
    busy?: boolean;
    loading?: boolean;
    sessions?: SessionInfo[];
    empty?: boolean;
    noWorkspace?: boolean;
  } = {},
) {
  mockIPC(() => {
    throw new Error("Browsing the launcher must not invoke database commands");
  });
  const onConnect = vi.fn();
  render(
    <ConnectionManager
      catalog={{
        ...catalog,
        profiles: options.empty ? [] : catalog.profiles,
        workspaces: options.noWorkspace ? [] : catalog.workspaces,
      }}
      sessions={options.sessions ?? []}
      loading={options.loading ?? false}
      busy={options.busy ?? false}
      onCatalog={vi.fn()}
      onConnect={onConnect}
    />,
  );
  return { onConnect, user: userEvent.setup() };
}

describe("connection launcher", () => {
  it("connects directly from a row without opening details", async () => {
    const { user, onConnect } = renderHome();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Connect to Local database" }),
    );
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(profile);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens details on demand via keyboard, then returns to the list", async () => {
    const { user, onConnect } = renderHome();
    screen
      .getByRole("button", { name: "View details for Local database" })
      .focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Local database" });
    expect(
      within(dialog).getByText("Preferred · may be unencrypted"),
    ).toBeTruthy();
    expect(onConnect).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Connect to Local database" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "View details for Local database" }),
    );
  });
  it("opens the editor directly without stacking a details dialog", async () => {
    const { user } = renderHome();
    await user.click(
      screen.getByRole("button", { name: "Edit Local database" }),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      (screen.getByLabelText("Connection name") as HTMLInputElement).value,
    ).toBe(profile.name);
  });
  it("switches from details to duplication without stacked dialogs or reused credentials", async () => {
    const { user } = renderHome();
    await user.click(
      screen.getByRole("button", { name: "View details for Local database" }),
    );
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      (screen.getByLabelText("Connection name") as HTMLInputElement).value,
    ).toContain("copy");
    expect(
      (screen.getByLabelText("Password", { exact: true }) as HTMLInputElement)
        .value,
    ).toBe("");
  });
  it("clears both search and environment filters with one action", async () => {
    const { user } = renderHome();
    await user.type(
      screen.getByRole("textbox", { name: "Search connections" }),
      "missing",
    );
    await user.selectOptions(
      screen.getByLabelText("Environment"),
      "production",
    );
    expect(
      screen.getByRole("heading", { name: "No matching connections" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 of 1 connection");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("button", { name: "Connect to Local database" }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Environment") as HTMLSelectElement).value,
    ).toBe("all");
  });
  it("uses Open for active connections and protects their settings", async () => {
    const { user, onConnect } = renderHome({
      sessions: [
        {
          ...profile,
          id: "session-1",
          profileId: profile.id,
          serverVersion: "PostgreSQL",
        },
      ],
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Edit Local database",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Open Local database" }),
    );
    expect(onConnect).toHaveBeenCalledExactlyOnceWith(profile);
    await user.click(
      screen.getByRole("button", { name: "View details for Local database" }),
    );
    for (const name of ["Edit", "Delete"])
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
  });
  it("does not allow a second connection action while busy", async () => {
    const { user, onConnect } = renderHome({ busy: true });
    await user.click(
      screen.getByRole("button", { name: "Connect to Local database" }),
    );
    expect(onConnect).not.toHaveBeenCalled();
  });
  it("shows workspace-specific onboarding without an empty inspector", () => {
    renderHome({ empty: true });
    expect(
      screen.getByRole("heading", { name: "Add your first connection" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add PostgreSQL connection" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("starts first-run onboarding with workspace creation", async () => {
    const { user } = renderHome({ empty: true, noWorkspace: true });
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(screen.getByRole("dialog", { name: "New workspace" })).toBeTruthy();
  });
  it("does not offer onboarding actions while the catalog is loading", () => {
    renderHome({ empty: true, loading: true });
    expect(
      screen.getByRole("heading", { name: "Loading connections…" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add PostgreSQL connection" }),
    ).toBeNull();
  });
});
