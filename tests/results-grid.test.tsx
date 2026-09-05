import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ResultsGrid } from "../src/features/query/ResultsGrid";

it("bounds rendered rows and resets pagination for a new result set", async () => {
  const user = userEvent.setup();
  const resultSet = {
    columns: ["value"],
    rows: Array.from({ length: 5000 }, (_, i) => [`value-${i}`]),
    affectedRows: 0,
    truncated: false,
  };
  const view = render(
    <ResultsGrid resultSet={resultSet} busy={false} error={null} />,
  );
  expect(screen.getAllByRole("row")).toHaveLength(101);
  expect(screen.queryByText("value-100")).toBeNull();
  await user.click(screen.getByText("Next rows"));
  expect(screen.getByText("value-100")).toBeTruthy();
  view.rerender(
    <ResultsGrid resultSet={{ ...resultSet }} busy={false} error={null} />,
  );
  expect(screen.getByText("value-0")).toBeTruthy();
});
