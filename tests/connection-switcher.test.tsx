import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConnectionSwitcher } from "../src/features/connections/ConnectionSwitcher";
import { newProfile } from "../src/features/connections/connection-types";

it("searches only the current workspace, identifies current sessions and routes selection explicitly", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const local = {
    ...newProfile("mmo"),
    id: "local",
    name: "Local",
    credentialId: null,
  };
  const prod = {
    ...local,
    id: "prod",
    name: "Live",
    environment: "production" as const,
  };
  render(
    <ConnectionSwitcher
      current={{
        ...local,
        id: "session",
        profileId: "local",
        serverVersion: "test",
      }}
      workspace={{ id: "mmo", name: "MMO" }}
      profiles={[
        local,
        prod,
        { ...local, id: "other", name: "Warehouse", workspaceId: "other" },
      ]}
      sessions={[]}
      busy={false}
      onSelect={onSelect}
      onClose={vi.fn()}
      onManage={vi.fn()}
    />,
  );
  expect(screen.queryByText("Warehouse")).toBeNull();
  expect(screen.getByText("Current")).toBeTruthy();
  await user.type(screen.getByRole("textbox"), "production");
  expect(screen.queryByText("Current")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Live/ }));
  expect(onSelect).toHaveBeenCalledWith(prod);
});

it("uses the same three-column structure for current, open and disconnected profiles", () => {
  const local = {
    ...newProfile("mmo"),
    id: "local",
    name: "Local",
    credentialId: null,
  };
  const staging = {
    ...local,
    id: "staging",
    name: "QA",
    environment: "staging" as const,
    readOnly: true,
  };
  const prod = {
    ...local,
    id: "prod",
    name: "Live",
    environment: "production" as const,
  };
  const current = {
    ...local,
    id: "session",
    profileId: local.id,
    serverVersion: "test",
  };
  render(
    <ConnectionSwitcher
      current={current}
      profiles={[local, staging, prod]}
      sessions={[
        current,
        { ...current, ...staging, id: "qa-session", profileId: staging.id },
      ]}
      busy={false}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onManage={vi.fn()}
    />,
  );
  const rows = ["Current", "Open session", "Not connected"].map((status) =>
    screen.getByRole("button", { name: new RegExp(status) }),
  );
  for (const row of rows) {
    expect(row.children).toHaveLength(3);
    expect(row.querySelector(":scope > svg")).toBeNull();
  }
  expect(rows[0].getAttribute("aria-current")).toBe("true");
  expect(rows[1].hasAttribute("aria-current")).toBe(false);
  expect(within(rows[1]).getByText(/Read-only/)).toBeTruthy();
});

it("supports keyboard selection, empty search results and disabled actions while busy", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const local = {
    ...newProfile("mmo"),
    id: "local",
    name: "Local",
    credentialId: null,
  };
  const props = {
    current: {
      ...local,
      id: "session",
      profileId: local.id,
      serverVersion: "test",
    },
    profiles: [local],
    sessions: [],
    busy: false,
    onSelect,
    onClose: vi.fn(),
    onManage: vi.fn(),
  };
  const view = render(<ConnectionSwitcher {...props} />);
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: /Current/ }),
  );
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(local);
  await user.type(screen.getByRole("textbox"), "does not exist");
  expect(
    screen.getByText("No matching connections in this workspace."),
  ).toBeTruthy();
  await user.clear(screen.getByRole("textbox"));

  view.rerender(<ConnectionSwitcher {...props} busy />);
  for (const name of [/Current/, /New connection/, /Manage workspaces/]) {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
  }
  expect(onSelect).toHaveBeenCalledOnce();
  expect(props.onManage).not.toHaveBeenCalled();
});
