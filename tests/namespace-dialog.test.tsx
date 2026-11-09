import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { expect, it, vi } from "vitest";
import { NamespaceDialog } from "../src/features/explorer/NamespaceDialog";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { createDatabaseApi } from "../src/shared/lib/database-api";
import type {
  NamespaceChange,
  NamespaceKind,
  NamespacePlan,
} from "../src/shared/types/structure";

type Options = {
  mode?: NamespaceKind;
  initialName?: string;
  online?: boolean;
  readOnly?: boolean;
  apply?: () => Promise<unknown>;
  preview?: () => Promise<NamespacePlan>;
};

function plan(input: NamespaceChange): NamespacePlan {
  return {
    sql:
      input.kind === "create"
        ? `CREATE SCHEMA "${input.name}";`
        : input.kind === "rename"
          ? `ALTER SCHEMA "${input.name}" RENAME TO "${input.newName}";`
          : `DROP SCHEMA "${input.name}" ${input.dropMode === "cascade" ? "CASCADE" : "RESTRICT"};`,
    destructive: input.kind === "drop",
  };
}

async function mount(options: Options = {}) {
  const user = userEvent.setup();
  let currentSessionId = "s";
  const applied = vi.fn();
  const closed = vi.fn();
  const preview = vi.fn(async (input: NamespaceChange) =>
    options.preview ? options.preview() : plan(input),
  );
  const apply = vi
    .fn<(input: NamespaceChange, confirmation: string) => Promise<unknown>>()
    .mockImplementation(async () => (options.apply ? options.apply() : null));
  mockIPC((command, args) => {
    const payload = args as {
      input: NamespaceChange;
      confirmation: string;
      sessionId: string;
    };
    expect(payload.sessionId).toBe(currentSessionId);
    if (command === "preview_namespace_change") return preview(payload.input);
    if (command === "apply_namespace_change")
      return apply(payload.input, payload.confirmation);
    throw new Error(`unexpected ${command}`);
  });
  const mode = options.mode ?? "create";
  function Harness({ sessionId = "s" }: { sessionId?: string }) {
    const [open, setOpen] = useState(false);
    return (
      <WorkSafetyProvider>
        <SessionProvider
          session={{
            ...newProfile("w"),
            id: sessionId,
            profileId: "p",
            serverVersion: "17",
            name: "Development",
            database: "product",
            readOnly: options.readOnly ?? false,
          }}
        >
          <button onClick={() => setOpen(true)}>Manage schema</button>
          <NamespaceDialog
            open={open}
            mode={mode}
            initialName={
              options.initialName ?? (mode === "create" ? "" : "analytics")
            }
            sessionId={sessionId}
            online={options.online ?? true}
            readOnly={options.readOnly ?? false}
            api={createDatabaseApi(sessionId)}
            onClose={() => {
              closed();
              setOpen(false);
            }}
            onApplied={applied}
          />
        </SessionProvider>
      </WorkSafetyProvider>
    );
  }
  const view = render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Manage schema" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.tagName).toBe("DIALOG");
  return {
    user,
    applied,
    closed,
    preview,
    apply,
    dialog,
    trigger,
    switchSession(sessionId: string) {
      currentSessionId = sessionId;
      view.rerender(<Harness sessionId={sessionId} />);
    },
  };
}

async function review(user: ReturnType<typeof userEvent.setup>, sql: string) {
  await user.click(screen.getByRole("button", { name: "Review SQL" }));
  await screen.findByText(sql);
}

it("reviews a new schema without writing, then explicitly creates it", async () => {
  const { user, preview, apply, applied, closed } = await mount();
  expect(screen.getByRole("dialog", { name: "New schema" })).toBeTruthy();
  const input = screen.getByRole("textbox", { name: /^Schema name(?: |$)/ });
  expect(screen.getByRole("button", { name: "Review SQL" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.type(input, "analytics");
  await review(user, 'CREATE SCHEMA "analytics";');
  expect(preview).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Create schema" }));
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "create",
      name: "analytics",
      dropMode: "restrict",
    }),
    "",
  );
  expect(closed).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("prefills rename, rejects an unchanged name and requires fresh review after Back", async () => {
  const { user, preview, apply } = await mount({ mode: "rename" });
  const input = screen.getByRole("textbox", {
    name: /^New name(?: |$)/,
  }) as HTMLInputElement;
  expect(input.value).toBe("analytics");
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe("analytics".length);
  expect(screen.getByRole("button", { name: "Review SQL" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.clear(input);
  await user.type(input, "analytics_v2");
  await review(user, 'ALTER SCHEMA "analytics" RENAME TO "analytics_v2";');
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.queryByRole("button", { name: "Rename schema" })).toBeNull();
  expect(
    screen.queryByText('ALTER SCHEMA "analytics" RENAME TO "analytics_v2";'),
  ).toBeNull();
  const draft = screen.getByRole("textbox", { name: /^New name(?: |$)/ });
  await user.clear(draft);
  await user.type(draft, "analytics_v3");
  await review(user, 'ALTER SCHEMA "analytics" RENAME TO "analytics_v3";');
  expect(preview).toHaveBeenCalledTimes(2);
  expect(apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Rename schema" }));
  await waitFor(() =>
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "rename",
        name: "analytics",
        newName: "analytics_v3",
      }),
      "",
    ),
  );
});

it("preserves the exact existing schema name instead of trimming the target", async () => {
  const { user, preview, apply } = await mount({
    mode: "rename",
    initialName: " analytics ",
  });
  const input = screen.getByRole("textbox", { name: /^New name(?: |$)/ });
  expect(input).toHaveProperty("value", " analytics ");
  expect(screen.getByRole("button", { name: "Review SQL" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.clear(input);
  await user.type(input, "reports");
  await review(user, 'ALTER SCHEMA " analytics " RENAME TO "reports";');
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({ name: " analytics " }),
  );
  await user.click(screen.getByRole("button", { name: "Rename schema" }));
  await waitFor(() =>
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ name: " analytics ", newName: "reports" }),
      "",
    ),
  );
});

it("discards a reviewed plan when the session changes", async () => {
  const { user, preview, apply, switchSession } = await mount();
  await user.type(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
    "analytics",
  );
  await review(user, 'CREATE SCHEMA "analytics";');
  expect(screen.getByRole("button", { name: "Create schema" })).toBeTruthy();
  switchSession("s2");
  expect(screen.queryByText('CREATE SCHEMA "analytics";')).toBeNull();
  expect(screen.queryByRole("button", { name: "Create schema" })).toBeNull();
  expect(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
  ).toHaveProperty("value", "");
  expect(screen.getByRole("button", { name: "Review SQL" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(preview).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
});

it("defaults deletion to RESTRICT and requires the exact name after review", async () => {
  const { user, apply, applied } = await mount({ mode: "drop" });
  expect(screen.getByRole("dialog", { name: "Delete schema" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /Only if empty/ })).toHaveProperty(
    "checked",
    true,
  );
  await review(user, 'DROP SCHEMA "analytics" RESTRICT;');
  const confirm = screen.getByRole("button", { name: "Delete schema" });
  expect(confirm).toHaveProperty("disabled", true);
  const input = screen.getByRole("textbox", {
    name: "Type analytics to confirm",
  });
  await user.type(input, "Analytics");
  expect(confirm).toHaveProperty("disabled", true);
  expect(apply).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "analytics");
  expect(confirm).toHaveProperty("disabled", false);
  await user.click(confirm);
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "drop",
      name: "analytics",
      dropMode: "restrict",
    }),
    "analytics",
  );
});

it("requires fresh cascade acknowledgement and typed confirmation after Back", async () => {
  const { user, preview, apply } = await mount({ mode: "drop" });
  await user.click(
    screen.getByRole("radio", { name: /Include contained objects/ }),
  );
  expect(preview).not.toHaveBeenCalled();
  await review(user, 'DROP SCHEMA "analytics" CASCADE;');
  expect(screen.queryByRole("radio")).toBeNull();
  const acknowledge = () =>
    screen.getByRole("checkbox", {
      name: "I understand that this also deletes contained objects and their dependencies.",
    });
  await user.type(
    screen.getByRole("textbox", { name: "Type analytics to confirm" }),
    "analytics",
  );
  expect(screen.getByRole("button", { name: "Delete schema" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(acknowledge());
  expect(screen.getByRole("button", { name: "Delete schema" })).toHaveProperty(
    "disabled",
    false,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.queryByText('DROP SCHEMA "analytics" CASCADE;')).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete schema" })).toBeNull();
  await user.click(screen.getByRole("radio", { name: /Only if empty/ }));
  expect(preview).toHaveBeenCalledTimes(1);
  await review(user, 'DROP SCHEMA "analytics" RESTRICT;');
  expect(
    screen.getByRole("textbox", { name: "Type analytics to confirm" }),
  ).toHaveProperty("value", "");
  expect(screen.queryByRole("checkbox")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(
    screen.getByRole("radio", { name: /Include contained objects/ }),
  );
  await review(user, 'DROP SCHEMA "analytics" CASCADE;');
  expect(acknowledge()).toHaveProperty("checked", false);
  expect(
    screen.getByRole("textbox", { name: "Type analytics to confirm" }),
  ).toHaveProperty("value", "");
  expect(apply).not.toHaveBeenCalled();
  await user.click(acknowledge());
  await user.type(
    screen.getByRole("textbox", { name: "Type analytics to confirm" }),
    "analytics",
  );
  await user.click(screen.getByRole("button", { name: "Delete schema" }));
  await waitFor(() =>
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ dropMode: "cascade" }),
      "analytics",
    ),
  );
});

it("keeps deletion guards even if the preview omits its destructive flag", async () => {
  const { user, apply } = await mount({
    mode: "drop",
    preview: () =>
      Promise.resolve({
        sql: 'DROP SCHEMA "analytics" RESTRICT;',
        destructive: false,
      }),
  });
  await review(user, 'DROP SCHEMA "analytics" RESTRICT;');
  expect(screen.getByRole("button", { name: "Delete schema" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    screen.getByRole("textbox", { name: "Type analytics to confirm" }),
  ).toHaveProperty("value", "");
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  expect(apply).not.toHaveBeenCalled();
});

it("keeps rejected changes visible and permits a deliberate retry", async () => {
  const rejection = vi
    .fn()
    .mockRejectedValueOnce({
      kind: "rejected",
      message: "SQLSTATE 42501: Access denied.",
    })
    .mockResolvedValue(null);
  const { user, apply, applied } = await mount({ apply: rejection });
  await user.type(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
    "analytics",
  );
  await review(user, 'CREATE SCHEMA "analytics";');
  await user.click(screen.getByRole("button", { name: "Create schema" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("SQLSTATE 42501"),
  );
  expect(applied).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create schema" })).toHaveProperty(
    "disabled",
    false,
  );
  await user.click(screen.getByRole("button", { name: "Create schema" }));
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledTimes(2);
});

it("blocks retries when commit outcome is unknown", async () => {
  const { user, apply, applied } = await mount({
    apply: () =>
      Promise.reject({
        kind: "unknown",
        message: "The connection closed while confirming commit.",
      }),
  });
  await user.type(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
    "analytics",
  );
  await review(user, 'CREATE SCHEMA "analytics";');
  await user.click(screen.getByRole("button", { name: "Create schema" }));
  expect(await screen.findByText("Outcome not confirmed")).toBeTruthy();
  const retry = screen.queryByRole("button", { name: "Create schema" });
  if (retry) expect(retry).toHaveProperty("disabled", true);
  const back = screen.queryByRole("button", { name: "Back" });
  if (back) expect(back).toHaveProperty("disabled", true);
  expect(apply).toHaveBeenCalledOnce();
  expect(applied).not.toHaveBeenCalled();
});

it("shows preview errors without writing and retains the draft", async () => {
  const { user, apply } = await mount({
    preview: () => Promise.reject("Schema name exceeds PostgreSQL's limit."),
  });
  await user.type(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
    "analytics",
  );
  await user.click(screen.getByRole("button", { name: "Review SQL" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("exceeds PostgreSQL"),
  );
  expect(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
  ).toHaveProperty("value", "analytics");
  expect(apply).not.toHaveBeenCalled();
});

it.each([
  { readOnly: true, online: true },
  { readOnly: false, online: false },
])(
  "prevents writes when readOnly=$readOnly and online=$online",
  async (options) => {
    const { preview, apply } = await mount({
      ...options,
      initialName: "analytics",
    });
    expect(screen.getByRole("button", { name: "Review SQL" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(preview).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  },
);

it("closes through native cancel and restores the opening control's focus", async () => {
  const { dialog, closed, trigger } = await mount();
  const event = new Event("cancel", { bubbles: false, cancelable: true });
  fireEvent(dialog, event);
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(closed).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
});

it("blocks dismissal and repeated submission while apply is running", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { user, dialog, apply, applied, closed } = await mount({
    apply: () => pending,
  });
  await user.type(
    screen.getByRole("textbox", { name: /^Schema name(?: |$)/ }),
    "analytics",
  );
  await review(user, 'CREATE SCHEMA "analytics";');
  await user.click(screen.getByRole("button", { name: "Create schema" }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  fireEvent.submit(dialog.querySelector("form")!);
  fireEvent.submit(dialog.querySelector("form")!);
  expect(apply).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Close dialog" })).toHaveProperty(
    "disabled",
    true,
  );
  const cancel = screen.queryByRole("button", { name: "Cancel" });
  if (cancel) expect(cancel).toHaveProperty("disabled", true);
  fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(closed).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBe(dialog);
  await act(async () => finish());
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(closed).toHaveBeenCalledOnce();
  expect(apply).toHaveBeenCalledOnce();
});
