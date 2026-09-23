import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { ActionMenu } from "../src/shared/components/ActionMenu";
import { WorkspaceGlyph } from "../src/shared/components/WorkspaceGlyph";
import { ConnectionList } from "../src/features/connections/ConnectionList";
import { newProfile } from "../src/features/connections/connection-types";

describe("desktop action menu", () => {
  const actions = (onSelect = vi.fn()) => [
    { label: "Edit", icon: Pencil, onSelect },
    { label: "Delete", icon: Trash2, disabled: true, onSelect },
    { label: "Copy", icon: Copy, onSelect },
  ];
  it("opens with the keyboard, skips disabled actions and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Actions" actions={actions()} />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Edit" }),
    );
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Copy" }),
    );
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Edit" }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("performs one action, closes, and does not activate disabled actions", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionMenu label="Actions" actions={actions(onSelect)} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("dismisses on an outside interaction and when its context becomes busy", async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <ActionMenu label="Actions" actions={actions()} />
        <button>Outside</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    view.rerender(<ActionMenu label="Actions" actions={actions()} disabled />);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

it("organizes connections by environment without changing their connect target", async () => {
  const profiles = [
    {
      ...newProfile("mmo"),
      id: "production",
      name: "Live",
      environment: "production" as const,
      credentialId: null,
    },
    {
      ...newProfile("mmo"),
      id: "local",
      name: "Development",
      credentialId: null,
    },
  ];
  const onConnect = vi.fn();
  render(
    <ConnectionList
      workspace={{ id: "mmo", name: "MMO" }}
      visible={profiles}
      profileCount={2}
      sessions={[]}
      loading={false}
      available
      search=""
      environment="all"
      onSearch={vi.fn()}
      onEnvironment={vi.fn()}
      onSelect={vi.fn()}
      onConnect={onConnect}
      onEdit={vi.fn()}
      onRename={vi.fn()}
      onCreate={vi.fn()}
    />,
  );
  const groups = screen
    .getAllByRole("region")
    .filter(
      (group) => group.getAttribute("aria-label") !== "Saved connections",
    );
  expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
    "Local connections",
    "Production connections",
  ]);
  await userEvent
    .setup()
    .click(within(groups[1]).getByRole("button", { name: "Connect to Live" }));
  expect(onConnect).toHaveBeenCalledExactlyOnceWith(profiles[0]);
});

it("keeps workspace identity stable and hides decorative initials from assistive technology", () => {
  const first = render(<WorkspaceGlyph name="MMO" />);
  const glyph = first.container.firstElementChild!;
  const className = glyph.className;
  expect(glyph.getAttribute("aria-hidden")).toBe("true");
  expect(glyph.textContent).toBe("M");
  first.rerender(<WorkspaceGlyph name="MMO" />);
  expect(first.container.firstElementChild!.className).toBe(className);
});
