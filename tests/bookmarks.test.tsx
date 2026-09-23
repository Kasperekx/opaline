import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { QueryLibrary } from "../src/features/query/QueryLibrary";
import {
  writeSavedQueries,
  loadSavedQueries,
} from "../src/features/query/useSavedQueries";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";
import { SessionProvider } from "../src/features/connections/SessionContext";
import { newProfile } from "../src/features/connections/connection-types";

const entries = [
  {
    id: "one",
    title: "Players",
    sql: "select * from players;",
    updatedAt: "2026-09-22",
  },
  {
    id: "two",
    title: "Accounts",
    sql: "select 9007199254740993;",
    updatedAt: "2026-09-22",
  },
];
function mount() {
  writeSavedQueries("bookmarks", entries);
  const onOpen = vi.fn(),
    onClose = vi.fn();
  render(
    <WorkSafetyProvider>
      <SessionProvider
        session={{
          ...newProfile("bookmarks"),
          id: "s",
          profileId: "p",
          serverVersion: "17",
          name: "Development",
        }}
      >
        <QueryLibrary
          sql="select 42;"
          title="Current query"
          onOpen={onOpen}
          onClose={onClose}
        />
      </SessionProvider>
    </WorkSafetyProvider>,
  );
  return { onOpen, onClose };
}
it("previews bookmarks with keyboard navigation and opens only explicitly", async () => {
  const { onOpen } = mount();
  const user = userEvent.setup();
  const list = screen.getByRole("navigation", { name: "Saved queries" });
  await user.click(within(list).getByRole("button", { name: /Players/ }));
  await user.keyboard("{ArrowDown}");
  expect(screen.getByLabelText("Saved SQL").textContent).toBe(entries[1].sql);
  expect(onOpen).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open query" }));
  expect(onOpen).toHaveBeenCalledWith(entries[1].sql, "Accounts");
});
it("searches SQL, handles no matches and saves without modifying existing bookmarks", async () => {
  mount();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Find saved query"),
    "9007199254740993",
  );
  expect(screen.getByLabelText("Saved SQL").textContent).toBe(entries[1].sql);
  await user.type(screen.getByLabelText("Find saved query"), "absent");
  expect(screen.getByText("No matching bookmarks")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Bookmark current query" }),
  );
  expect(document.activeElement).toBe(
    screen.getByLabelText("Saved query name"),
  );
  await user.clear(screen.getByLabelText("Saved query name"));
  await user.type(screen.getByLabelText("Saved query name"), "Useful SQL");
  await user.click(screen.getByRole("button", { name: "Save bookmark" }));
  expect(loadSavedQueries("bookmarks")).toHaveLength(3);
  expect(loadSavedQueries("bookmarks")[0]).toMatchObject({
    title: "Useful SQL",
    sql: "select 42;",
  });
  expect(screen.getByLabelText("Saved SQL").textContent).toBe("select 42;");
});
it("requires confirmation before deleting a bookmark", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Delete Players" }));
  expect(loadSavedQueries("bookmarks")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Keep bookmark" }));
  await user.click(screen.getByRole("button", { name: "Delete Players" }));
  await user.click(screen.getByRole("button", { name: "Delete bookmark" }));
  expect(loadSavedQueries("bookmarks")).toEqual([entries[1]]);
  expect(screen.getByLabelText("Saved SQL").textContent).toBe(entries[1].sql);
});

it("protects an unfinished bookmark name when opening a saved query", async () => {
  const { onOpen } = mount();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Bookmark current query" }),
  );
  await user.type(screen.getByLabelText("Saved query name"), " edited");
  await user.click(screen.getByRole("button", { name: "Open query" }));
  expect(onOpen).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Keep working" }));
  expect(screen.getByLabelText("Saved query name")).toHaveProperty(
    "value",
    "Current query edited",
  );
  expect(loadSavedQueries("bookmarks")).toHaveLength(2);
});
