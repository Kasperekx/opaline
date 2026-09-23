import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { TopBar } from "../src/shared/components/TopBar";
import { WorkspaceShelf } from "../src/features/connections/WorkspaceShelf";
import { WorkspaceTabs } from "../src/features/query/WorkspaceTabs";

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
  it("supports native dragging and workspace selection on the source list", () => {
    const invoke = vi.fn();
    const onSelect = vi.fn();
    mockWindows("main");
    mockIPC((command) => invoke(command));
    render(
      <WorkspaceShelf
        workspaces={[{ id: "mmo", name: "MMO" }]}
        profiles={[]}
        available
        onSelect={onSelect}
        onCreate={vi.fn()}
      />,
    );
    fireEvent.mouseDown(screen.getByText("Workspaces"), {
      button: 0,
      detail: 1,
    });
    expect(invoke).toHaveBeenCalledWith("plugin:window|start_dragging");
    invoke.mockClear();
    fireEvent.mouseDown(screen.getByText("MMO", { selector: "span" }), {
      button: 0,
      detail: 1,
    });
    fireEvent.click(screen.getByText("MMO", { selector: "span" }));
    expect(invoke).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("mmo");
  });
  it("drags and maximizes from empty document chrome without capturing navigation controls", () => {
    const invoke = vi.fn();
    mockWindows("main");
    mockIPC((command) => invoke(command));
    render(
      <WorkspaceTabs
        tabs={[]}
        activeTabId=""
        runningTabId={null}
        startAction={<button>Browse tables</button>}
        endAction={null}
        onAddQuery={vi.fn()}
        onClose={vi.fn()}
        onRenameQuery={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const chrome = screen.getByRole("tablist").parentElement!;
    fireEvent.mouseDown(chrome, { button: 0, detail: 1 });
    expect(invoke).toHaveBeenCalledWith("plugin:window|start_dragging");
    fireEvent.mouseDown(chrome, { button: 0, detail: 2 });
    expect(invoke).toHaveBeenCalledWith("plugin:window|toggle_maximize");
    invoke.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Browse tables" }), {
      button: 0,
      detail: 1,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
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
