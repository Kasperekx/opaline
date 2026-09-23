import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { useWorkspaceCommands } from "../src/features/query/useWorkspaceCommands";
import {
  WorkSafetyProvider,
  useWorkRisk,
  useWorkSafety,
} from "../src/shared/safety/WorkSafety";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));
it("switches tabs without stealing braces and guards keyboard/native close", async () => {
  mockIPC(() => undefined);
  const close = vi.fn();
  const select = vi.fn();
  function Harness() {
    const safety = useWorkSafety();
    useWorkRisk({
      sessionId: "s",
      tabId: "a",
      label: "Unsaved table",
      dirty: true,
    });
    useWorkspaceCommands({
      active: true,
      hasQuery: false,
      workspace: {
        tabs: {
          tabs: [{ id: "a" }, { id: "b" }, { id: "c" }],
          activeTab: { id: "a" },
        },
      },
      documents: {},
      completions: {},
      onCloseTab: (id: string) =>
        safety.request(() => close(id), { sessionId: "s", tabId: id }),
      onSelectTab: select,
    } as unknown as Parameters<typeof useWorkspaceCommands>[0]);
    return <textarea aria-label="SQL" />;
  }
  render(
    <WorkSafetyProvider>
      <Harness />
    </WorkSafetyProvider>,
  );
  fireEvent.keyDown(window, { key: "}", code: "BracketRight", shiftKey: true });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(window, {
    key: "}",
    code: "BracketRight",
    shiftKey: true,
    metaKey: true,
  });
  expect(select).toHaveBeenLastCalledWith("b");
  select.mockClear();
  fireEvent.keyDown(screen.getByLabelText("SQL"), {
    key: "{",
    code: "BracketLeft",
    shiftKey: true,
  });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText("SQL"), {
    key: "{",
    code: "BracketLeft",
    shiftKey: true,
    metaKey: true,
  });
  expect(select).toHaveBeenLastCalledWith("c");
  fireEvent.keyDown(window, {
    key: "]",
    code: "BracketRight",
    shiftKey: true,
    ctrlKey: true,
  });
  expect(select).toHaveBeenLastCalledWith("b");
  const event = new KeyboardEvent("keydown", {
    key: "w",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => screen.getByLabelText("SQL").dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText("Unsaved table")).toBeTruthy();
  fireEvent.click(screen.getByText("Keep working"));
  await act(async () => {
    await Promise.resolve();
  });
  const callback = vi
    .mocked(listen)
    .mock.calls.find(([name]) => name === "request-close-tab")?.[1];
  expect(callback).toBeDefined();
  act(() => callback!({ event: "request-close-tab", id: 1, payload: null }));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Discard changes"));
  expect(close).toHaveBeenCalledWith("a");
});
