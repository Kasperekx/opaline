import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "./render-with-safety";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { createDatabaseApi } from "../src/shared/lib/database-api";
import { ProfileEditor } from "../src/features/connections/ProfileEditor";
import { ConnectProfileDialog } from "../src/features/connections/ConnectProfileDialog";
import { ConnectionManager } from "../src/features/connections/ConnectionManager";
import {
  newProfile,
  profileInput,
  type ConnectionProfile,
} from "../src/features/connections/connection-types";

const profile: ConnectionProfile = {
  ...newProfile("mmo"),
  id: "local",
  name: "Local PostgreSQL",
  workspaceId: "mmo",
  credentialId: "opaque-vault-id",
};
const workspaces = [{ id: "mmo", name: "MMO" }];
const catalog = { version: 1, workspaces, profiles: [profile] };

describe("explicit session routing", () => {
  it("adds the session ID to every read, mutation, cancellation and export", async () => {
    const calls: { command: string; payload: Record<string, unknown> }[] = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload: payload as Record<string, unknown> });
      return [];
    });
    const a = createDatabaseApi("session-A");
    const b = createDatabaseApi("session-B");
    await a.listObjects();
    await b.cancelQuery();
    await a.listColumns("public", "users");
    await b.inspectRelation("public", "users");
    await a.runQuery("SELECT 1", { maxRows: 100, timeoutMs: 1000 });
    for (const name of [
      "loadTablePage",
      "insertTableRow",
      "updateTableRow",
      "deleteTableRow",
      "deleteTableRows",
      "updateTableRows",
    ] as const) {
      await a[name]({} as never);
    }
    await a.exportTableData({} as never, () => {});
    expect(calls).toHaveLength(12);
    for (const call of calls)
      expect(call.payload.sessionId).toBe(
        ["cancel_query", "inspect_relation"].includes(call.command)
          ? "session-B"
          : "session-A",
      );
  });
});

describe("connection profiles", () => {
  it("duplicates settings but never reuses a saved credential", () => {
    const copy = profileInput(profile, true);
    expect(copy.id).toBeNull();
    expect(copy.password).toBe("");
    expect(copy.passwordAction).toBe("forget");
    expect(copy).not.toHaveProperty("credentialId");
  });
  it("requires a successful test, then invalidates it after a form change", async () => {
    const user = userEvent.setup();
    const test = vi.fn().mockResolvedValue({ serverVersion: "PostgreSQL 17" });
    mockIPC((command, payload) => {
      if (command === "test_profile") return test(payload);
      throw new Error("Unexpected save");
    });
    render(
      <ProfileEditor
        initial={{ ...newProfile("mmo"), name: "Local" }}
        workspaces={workspaces}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", {
      name: "Save profile",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.type(screen.getByLabelText("Host", { exact: true }), ".changed");
    expect(save.disabled).toBe(true);
    expect(test).toHaveBeenCalledOnce();
  });
  it("production keeps write mode but cannot connect without the warning acknowledgment", async () => {
    const user = userEvent.setup();
    const connect = vi.fn().mockResolvedValue(true);
    render(
      <ConnectProfileDialog
        profile={{ ...profile, environment: "production", readOnly: false }}
        workspaceName="MMO"
        busy={false}
        error={null}
        onConnect={connect}
        onClose={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Connect to production",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(connect).toHaveBeenCalledWith(null, true);
  });
  it("filters profiles by product and environment", async () => {
    const user = userEvent.setup();
    mockIPC(() => []);
    render(
      <ConnectionManager
        catalog={{
          ...catalog,
          workspaces: [...workspaces, { id: "analytics", name: "Analytics" }],
          profiles: [
            profile,
            { ...profile, id: "prod", name: "Live", environment: "production" },
            {
              ...profile,
              id: "warehouse",
              name: "Warehouse",
              workspaceId: "analytics",
            },
          ],
        }}
        sessions={[]}
        loading={false}
        busy={false}
        onCatalog={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText("Environment"),
      "production",
    );
    expect(
      screen.queryByRole("button", { name: /Local PostgreSQL/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "View details for Live" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Analytics/ }));
    expect(
      screen.getByRole("button", { name: "View details for Warehouse" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "View details for Live" }),
    ).toBeNull();
  });
});
