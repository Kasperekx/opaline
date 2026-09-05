import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { QueryExecutionControl } from "../src/features/query/QueryExecutionControl";
import { WorkspaceTabs } from "../src/features/query/WorkspaceTabs";
import { useWorkspaceTabs } from "../src/features/query/useWorkspaceTabs";
import type { QueryExecutionMode } from "../src/shared/types/database";

it("requires explicit per-tab autocommit consent and can return to atomic", async () => {
  const changed = vi.fn();
  function View() {
    const [mode, setMode] = useState<QueryExecutionMode>("atomic");
    return (
      <QueryExecutionControl
        mode={mode}
        target="Product / Production / db.example.test / app"
        readOnly={false}
        busy={false}
        onChange={(value) => {
          changed(value);
          setMode(value);
        }}
      />
    );
  }
  render(<View />);
  const user = userEvent.setup();
  const select = screen.getByRole("combobox", { name: "SQL execution mode" });
  await user.selectOptions(select, "autocommit");
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").textContent).toContain("db.example.test");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Keep atomic" }),
  );
  await user.click(screen.getByRole("button", { name: "Keep atomic" }));
  expect(changed).not.toHaveBeenCalled();
  await user.selectOptions(select, "autocommit");
  await user.click(screen.getByRole("button", { name: "Enable autocommit" }));
  expect(changed).toHaveBeenLastCalledWith("autocommit");
  await user.selectOptions(select, "atomic");
  expect(changed).toHaveBeenLastCalledWith("atomic");
});

it("does not offer autocommit on read-only or busy sessions", () => {
  const props = {
    mode: "atomic" as const,
    target: "Local",
    readOnly: true,
    busy: false,
    onChange: vi.fn(),
  };
  const view = render(<QueryExecutionControl {...props} />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
    true,
  );
  view.rerender(<QueryExecutionControl {...props} readOnly={false} busy />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
    true,
  );
});

it("never persists or reopens autocommit, and resets it on reconnect", () => {
  const hook = renderHook(() => useWorkspaceTabs("mode-test"));
  const first = hook.result.current.activeTabId;
  act(() =>
    hook.result.current.updateQueryTab(first, (tab) => ({
      ...tab,
      executionMode: "autocommit",
    })),
  );
  act(() => hook.result.current.addQueryTab("SELECT 2"));
  expect(hook.result.current.activeTab).not.toHaveProperty(
    "executionMode",
    "autocommit",
  );
  act(() => hook.result.current.closeTab(first));
  act(() => hook.result.current.restoreClosedTab());
  expect(hook.result.current.activeTab).not.toHaveProperty(
    "executionMode",
    "autocommit",
  );
  act(() =>
    hook.result.current.updateQueryTab(
      hook.result.current.activeTabId,
      (tab) => ({ ...tab, executionMode: "autocommit" }),
    ),
  );
  act(() => hook.result.current.clearResults());
  expect(hook.result.current.activeTab).toHaveProperty(
    "executionMode",
    "atomic",
  );
  act(() =>
    hook.result.current.updateQueryTab(
      hook.result.current.activeTabId,
      (tab) => ({ ...tab, executionMode: "autocommit" }),
    ),
  );
  hook.unmount();
  const restored = renderHook(() => useWorkspaceTabs("mode-test"));
  expect(
    restored.result.current.tabs.every((tab) => !("executionMode" in tab)),
  ).toBe(true);
});

it("navigates tabs by keyboard and cancels F2 rename without saving", async () => {
  const rename = vi.fn();
  function View() {
    const tabs = useWorkspaceTabs("keyboard-tabs");
    return (
      <WorkspaceTabs
        tabs={tabs.tabs}
        activeTabId={tabs.activeTabId}
        runningTabId={null}
        endAction={<button>Reopen</button>}
        onAddQuery={() => tabs.addQueryTab()}
        onClose={tabs.closeTab}
        onRenameQuery={rename}
        onSelect={tabs.setActiveTabId}
      />
    );
  }
  render(<View />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New SQL query" }));
  const second = screen.getByRole("tab", { name: /Query 2/ });
  second.focus();
  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: /Query 1/ }),
  );
  await user.keyboard("{End}{F2}");
  await user.clear(screen.getByRole("textbox", { name: "Query tab name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Query tab name" }),
    "cancel me{Escape}",
  );
  expect(rename).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: /Query 2/ }),
  );
  expect(
    screen.getByRole("tab", { name: /Query 2/ }).getAttribute("aria-selected"),
  ).toBe("true");
});
