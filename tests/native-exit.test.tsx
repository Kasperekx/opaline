import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { NativeExitGuard } from "../src/shared/safety/NativeExitGuard";
import {
  WorkSafetyProvider,
  useWorkRisk,
} from "../src/shared/safety/WorkSafety";
import {
  retryLocalWrites,
  writeLocalJson,
} from "../src/shared/lib/local-storage";

it("requires explicit consent to quit after local saving fails", async () => {
  let exitRequested!: EventCallback<unknown>;
  vi.mocked(listen).mockImplementation(async (_event, callback) => {
    exitRequested = callback as EventCallback<unknown>;
    return vi.fn();
  });
  const exit = vi.fn();
  mockIPC((command) => {
    if (command === "exit_application") exit();
  });
  const user = userEvent.setup();
  render(
    <WorkSafetyProvider>
      <NativeExitGuard />
    </WorkSafetyProvider>,
  );
  await waitFor(() => expect(exitRequested).toBeDefined());
  const failure = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("quota");
    });
  writeLocalJson("test-quota-exit", { sql: "select 'draft'" });
  act(() => exitRequested({ event: "request-app-exit", id: 1, payload: null }));
  expect(exit).not.toHaveBeenCalled();
  await user.click(screen.getByText("Quit without saving"));
  await waitFor(() => expect(exit).toHaveBeenCalledOnce());
  failure.mockRestore();
  retryLocalWrites();
});

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
function Draft({ busy }: { busy: boolean }) {
  useWorkRisk({ label: "Table draft", dirty: true, busy });
  return <NativeExitGuard />;
}
it.each([false, true])(
  "native exit respects drafts and busy operations (busy=%s)",
  async (busy) => {
    let exitRequested!: EventCallback<unknown>;
    vi.mocked(listen).mockImplementation(async (_event, callback) => {
      exitRequested = callback as EventCallback<unknown>;
      return vi.fn();
    });
    const exit = vi.fn();
    mockIPC((command) => {
      if (command === "exit_application") exit();
    });
    const user = userEvent.setup();
    render(
      <WorkSafetyProvider>
        <Draft busy={busy} />
      </WorkSafetyProvider>,
    );
    await waitFor(() => expect(exitRequested).toBeDefined());
    act(() =>
      exitRequested({ event: "request-app-exit", id: 1, payload: null }),
    );
    expect(exit).not.toHaveBeenCalled();
    if (busy) {
      expect(screen.queryByText("Discard changes")).toBeNull();
    } else {
      await user.click(screen.getByText("Keep working"));
      expect(exit).not.toHaveBeenCalled();
      act(() =>
        exitRequested({ event: "request-app-exit", id: 2, payload: null }),
      );
      await user.click(screen.getByText("Discard changes"));
      await waitFor(() => expect(exit).toHaveBeenCalledOnce());
    }
  },
);

it("repeated native Quit requests cannot bypass a failed save", async () => {
  let exitRequested!: EventCallback<unknown>;
  vi.mocked(listen).mockImplementation(async (_event, callback) => {
    exitRequested = callback as EventCallback<unknown>;
    return vi.fn();
  });
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const exit = vi.fn();
  mockIPC((command) => {
    if (command === "exit_application") exit();
  });
  function SavableDraft() {
    useWorkRisk({ label: "Native quit table draft", dirty: true, save });
    return <NativeExitGuard />;
  }
  const user = userEvent.setup();
  render(
    <WorkSafetyProvider>
      <SavableDraft />
    </WorkSafetyProvider>,
  );
  await waitFor(() => expect(exitRequested).toBeDefined());
  const quit = () =>
    act(() =>
      exitRequested({ event: "request-app-exit", id: 1, payload: null }),
    );
  quit();
  quit();
  expect(exit).not.toHaveBeenCalled();
  await user.click(screen.getByText("Save and continue"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Save was not completed or confirmed",
  );
  expect(exit).not.toHaveBeenCalled();
  await user.click(screen.getByText("Keep working"));
  quit();
  expect(exit).not.toHaveBeenCalled();
  await user.click(screen.getByText("Save and continue"));
  await waitFor(() => expect(exit).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledTimes(2);
});
