import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  WorkSafetyProvider,
  useWorkRisk,
  useWorkSafety,
} from "../src/shared/safety/WorkSafety";
import { useOperationLock } from "../src/shared/hooks/useOperationLock";
import { SessionProvider } from "../src/features/connections/SessionContext";
import {
  newProfile,
  type SessionInfo,
} from "../src/features/connections/connection-types";
import { useTableData } from "../src/features/table/useTableData";
import type { TableDataPage } from "../src/shared/types/database";
import { tableRowKey } from "../src/features/table/table-change-set";

const session: SessionInfo = {
  ...newProfile("mmo"),
  id: "s",
  profileId: "p",
  serverVersion: "test",
};
const page: TableDataPage = {
  page: 0,
  pageSize: 50,
  hasMore: true,
  columns: [
    {
      name: "id",
      dataType: "integer",
      nullable: false,
      defaultValue: null,
      primaryKey: true,
      identity: false,
      generated: false,
      enumValues: [],
    },
  ],
  rows: [{ values: ["1"], rowVersion: "1" }],
  editable: true,
  insertable: true,
  editabilityReason: null,
  insertabilityReason: null,
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkSafetyProvider>
    <SessionProvider session={session}>{children}</SessionProvider>
  </WorkSafetyProvider>
);

function Probe({
  busy = false,
  action,
}: {
  busy?: boolean;
  action: () => void;
}) {
  useWorkRisk({
    sessionId: "a",
    tabId: "table",
    label: "Unsaved user",
    dirty: true,
    busy,
  });
  const safety = useWorkSafety();
  return (
    <>
      <button onClick={() => safety.request(action, { sessionId: "a" })}>
        Close current
      </button>
      <button onClick={() => safety.request(action, { sessionId: "b" })}>
        Close other
      </button>
    </>
  );
}
it("guards only the affected session and makes keeping work the default", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <WorkSafetyProvider>
      <Probe action={action} />
    </WorkSafetyProvider>,
  );
  await user.click(screen.getByText("Close other"));
  expect(action).toHaveBeenCalledTimes(1);
  await user.click(screen.getByText("Close current"));
  expect(document.activeElement).toBe(screen.getByText("Keep working"));
  await user.click(screen.getByText("Keep working"));
  expect(action).toHaveBeenCalledTimes(1);
  await user.click(screen.getByText("Close current"));
  await user.click(screen.getByText("Discard changes"));
  expect(action).toHaveBeenCalledTimes(2);
});
it("never offers discard while an operation is running", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <WorkSafetyProvider>
      <Probe action={action} busy />
    </WorkSafetyProvider>,
  );
  await user.click(screen.getByText("Close current"));
  expect(screen.queryByText("Discard changes")).toBeNull();
  expect(action).not.toHaveBeenCalled();
});
it.each([
  "setPage",
  "setPageSize",
  "applyFilter",
  "clearFilter",
  "toggleSort",
  "refresh",
] as const)("protects table drafts before %s", async (name) => {
  const user = userEvent.setup();
  mockIPC(() => page);
  const hook = renderHook(
    () =>
      useTableData({
        id: "table",
        kind: "table",
        title: "users",
        schema: "public",
        table: "users",
        objectType: "table",
      }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  const key = tableRowKey(page.columns, page.rows[0]);
  act(() => hook.result.current.changes.start(key, 0, page.rows[0]));
  act(() => hook.result.current.changes.update(key, 0, "2"));
  act(() => {
    if (name === "setPage") hook.result.current.setPage(1);
    else if (name === "setPageSize") hook.result.current.setPageSize(100);
    else if (name === "toggleSort") hook.result.current.toggleSort("id");
    else hook.result.current[name]();
  });
  expect(hook.result.current.changes.rows[0].values).toEqual(["2"]);
  await user.click(screen.getByText("Keep working"));
  expect(hook.result.current.changes.rows[0].values).toEqual(["2"]);
});
it("prevents duplicate operations before React can rerender", async () => {
  let finish!: () => void;
  const operation = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(useOperationLock);
  const first = hook.result.current(operation);
  expect(await hook.result.current(operation)).toBe(false);
  expect(operation).toHaveBeenCalledOnce();
  finish();
  await first;
});
