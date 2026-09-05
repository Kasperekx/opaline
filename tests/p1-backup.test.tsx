import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { BackupDialog } from "../src/features/backup/BackupDialog";
import { backupApi } from "../src/features/backup/backup-api";
import { validNewDatabaseName } from "../src/features/backup/RestoreOptions";
import { SessionProvider } from "../src/features/connections/SessionContext";
import {
  WorkSafetyProvider,
  useWorkRisk,
} from "../src/shared/safety/WorkSafety";
import {
  newProfile,
  type SessionInfo,
} from "../src/features/connections/connection-types";

const session: SessionInfo = {
  ...newProfile("mmo"),
  id: "production-session",
  profileId: "prod",
  name: "Production",
  database: "game",
  host: "db.example.test",
  environment: "production",
  serverVersion: "17.11",
};
function Risk() {
  useWorkRisk({
    sessionId: "other",
    label: "Uncommitted table row",
    dirty: true,
  });
  return null;
}
function view(readOnly = false, dirty = false) {
  return render(
    <WorkSafetyProvider>
      <SessionProvider session={{ ...session, readOnly }}>
        {dirty && <Risk />}
        <BackupDialog objects={[]} workspaceName="MMO" onClose={vi.fn()} />
      </SessionProvider>
    </WorkSafetyProvider>,
  );
}
function tools() {
  vi.spyOn(backupApi, "tools").mockResolvedValue({
    id: "patched-tools",
    directory: "/trusted/bin",
    version: "17.11",
    major: 17,
    source: "custom",
  });
  vi.spyOn(backupApi, "prepare").mockResolvedValue({
    id: "immutable-snapshot",
    format: "custom",
    bytes: 1024,
    digest: "a".repeat(64),
    preview: "TABLE public users",
    serverMajor: 17,
  });
  vi.spyOn(backupApi, "release").mockResolvedValue();
  mockIPC((command) => {
    if (command === "plugin:dialog|open") return "/trusted/archive.dump";
    return null;
  });
}
it("validates database names by UTF-8 bytes without silently trimming", () => {
  for (const name of [
    "",
    " new",
    "new ",
    "a\nb",
    "x".repeat(64),
    "ż".repeat(32),
  ])
    expect(validNewDatabaseName(name)).toBe(false);
  for (const name of ["new database", 'odd"name', "żółć", "x".repeat(63)])
    expect(validNewDatabaseName(name)).toBe(true);
});
it("requires separate new database consent and resets it when the target changes", async () => {
  tools();
  const user = userEvent.setup();
  const restore = vi.spyOn(backupApi, "restore").mockResolvedValue({
    bytes: 1024,
    durationMs: 20,
    message: "Created and restored",
  });
  view();
  await user.click(screen.getByRole("button", { name: "Restore database" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Restore destination" }),
    "new",
  );
  await user.type(
    screen.getByRole("textbox", { name: "New database name" }),
    "game_copy",
  );
  await user.click(
    screen.getByRole("button", { name: "Choose dump and inspect" }),
  );
  await screen.findByRole("textbox", { name: "Dump preview" });
  const run = screen.getByRole("button", {
    name: "Create database & restore",
  }) as HTMLButtonElement;
  expect(run.disabled).toBe(true);
  expect(
    screen.queryByRole("checkbox", {
      name: /Allow restoring into a non-empty/,
    }),
  ).toBeNull();
  await user.click(screen.getByRole("checkbox", { name: /I trust this file/ }));
  await user.click(
    screen.getByRole("checkbox", {
      name: /I approve restoring into PRODUCTION/,
    }),
  );
  await user.type(
    screen.getByRole("textbox", {
      name: "Type the target database name: game_copy",
    }),
    "game_copy",
  );
  expect(run.disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", { name: /I approve creating this database/ }),
  );
  expect(run.disabled).toBe(false);
  await user.type(
    screen.getByRole("textbox", { name: "New database name" }),
    "2",
  );
  expect(run.disabled).toBe(true);
  expect(
    (
      screen.getByRole("checkbox", {
        name: /I approve creating this database/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", {
      name: /I approve restoring into PRODUCTION/,
    }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: /I approve creating this database/ }),
  );
  await user.type(
    screen.getByRole("textbox", {
      name: "Type the target database name: game_copy2",
    }),
    "game_copy2",
  );
  await user.click(run);
  await waitFor(() => expect(restore).toHaveBeenCalledOnce());
  expect(restore.mock.calls[0].slice(0, 2)).toEqual([
    "production-session",
    expect.objectContaining({
      newDatabase: "game_copy2",
      confirmCreate: true,
      confirmDatabase: "game_copy2",
      clean: false,
      allowNonempty: false,
      confirmProduction: true,
    }),
  ]);
});
it("never offers restore for a read-only session", () => {
  view(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Restore database",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("requires trusted file, exact target, separate production and clean consent", async () => {
  tools();
  const user = userEvent.setup();
  const restore = vi.spyOn(backupApi, "restore").mockResolvedValue({
    bytes: 1024,
    durationMs: 20,
    message: "Test restore complete",
  });
  view();
  await user.click(screen.getByRole("button", { name: "Restore database" }));
  await user.click(
    screen.getByRole("button", { name: "Choose dump and inspect" }),
  );
  await screen.findByRole("textbox", { name: "Dump preview" });
  expect(backupApi.prepare).toHaveBeenCalledWith(
    "production-session",
    null,
    "/trusted/archive.dump",
  );
  expect(backupApi.tools).not.toHaveBeenCalled();
  const run = screen.getByRole("button", {
    name: "Restore to this database",
  }) as HTMLButtonElement;
  expect(run.disabled).toBe(true);
  expect(restore).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox", { name: /I trust this file/ }));
  await user.type(
    screen.getByRole("textbox", {
      name: "Type the target database name: game",
    }),
    "game",
  );
  expect(run.disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", {
      name: /I approve restoring into PRODUCTION/,
    }),
  );
  expect(run.disabled).toBe(false);
  await user.click(
    screen.getByRole("checkbox", { name: /Allow restoring into a non-empty/ }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: /Drop existing objects/ }),
  );
  expect(run.disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", { name: /I explicitly approve dropping/ }),
  );
  await user.click(run);
  await waitFor(() => expect(restore).toHaveBeenCalledOnce());
  expect(restore.mock.calls[0][0]).toBe("production-session");
  expect(restore.mock.calls[0][1]).toMatchObject({
    preparedId: "immutable-snapshot",
    confirmDatabase: "game",
    confirmProduction: true,
    clean: true,
    confirmClean: true,
    trustedFile: true,
  });
});
it("blocks maintenance when another connection has unsaved table work", async () => {
  tools();
  const user = userEvent.setup();
  const dump = vi.spyOn(backupApi, "dump");
  view(false, true);
  await user.click(screen.getByRole("button", { name: "Create backup" }));
  expect(dump).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(
    "Finish or discard unsaved",
  );
});
it("creates a backup directly using bundled tools and the active session password", async () => {
  tools();
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "plugin:dialog|save") return "/chosen/database.dump";
    return null;
  });
  const dump = vi.spyOn(backupApi, "dump").mockResolvedValue({
    bytes: 1024,
    durationMs: 20,
    message: "Backup complete",
  });
  view();
  expect(screen.queryByRole("button", { name: "Detect tools" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Use custom tools" }).closest("details")
      ?.open,
  ).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Create backup" }));
  await screen.findByText(/Backup complete/);
  expect(dump).toHaveBeenCalledOnce();
  expect(dump.mock.calls[0].slice(0, 2)).toEqual([
    "production-session",
    {
      toolsId: null,
      password: null,
      path: "/chosen/database.dump",
      format: "custom",
      content: "all",
      schemas: [],
      tables: [],
    },
  ]);
  expect(backupApi.tools).not.toHaveBeenCalled();
  expect(
    commands.filter((command) => command.startsWith("plugin:dialog")),
  ).toEqual(["plugin:dialog|save"]);
});
it("cancelling the destination dialog never resolves tools or starts a backup", async () => {
  tools();
  const dump = vi.spyOn(backupApi, "dump");
  view();
  await userEvent.click(screen.getByRole("button", { name: "Create backup" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Create backup",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(dump).not.toHaveBeenCalled();
  expect(backupApi.tools).not.toHaveBeenCalled();
});
it("keeps custom engines in Advanced, scoped to this session and resettable", async () => {
  tools();
  const user = userEvent.setup();
  view();
  await user.click(screen.getByText("Advanced settings"));
  await user.click(screen.getByRole("button", { name: "Use custom tools" }));
  await screen.findByText("Custom engine · PostgreSQL 17.11");
  expect(backupApi.tools).toHaveBeenCalledWith(
    "production-session",
    "/trusted/archive.dump",
  );
  await user.click(
    screen.getByRole("button", { name: "Use automatic engine" }),
  );
  expect(
    screen.getByText("Built-in engine · selected automatically"),
  ).toBeTruthy();
});
