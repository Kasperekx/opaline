import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { TopBar } from "../src/shared/components/TopBar";

function renderHeader() {
  const invoke = vi.fn();
  mockWindows("main");
  mockIPC((command) => invoke(command));
  render(
    <TopBar
      title="Workspace"
      action={
        <button>
          <span>Connect</span>
        </button>
      }
    />,
  );
  return invoke;
}

describe("native window headers", () => {
  it("drags from non-interactive header content", () => {
    const invoke = renderHeader();
    fireEvent.mouseDown(screen.getByText("Workspace"), {
      button: 0,
      detail: 1,
    });
    expect(invoke).toHaveBeenCalledWith("plugin:window|start_dragging");
  });
  it("toggles maximize on a double click", () => {
    const invoke = renderHeader();
    fireEvent.mouseDown(screen.getByText("Workspace"), {
      button: 0,
      detail: 2,
    });
    expect(invoke).toHaveBeenCalledWith("plugin:window|toggle_maximize");
  });
  it("does not steal clicks from a button's child", () => {
    const invoke = renderHeader();
    fireEvent.mouseDown(screen.getByText("Connect"), { button: 0, detail: 1 });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("ignores non-primary pointer buttons", () => {
    const invoke = renderHeader();
    fireEvent.mouseDown(screen.getByText("Workspace"), {
      button: 2,
      detail: 1,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
