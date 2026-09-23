import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CellValue } from "../src/features/table/TableCells";

it("highlights a bounded JSON preview without rounding numbers or changing strings", () => {
  const value =
    '{\n  "id": 9007199254740993, "id": 1e400, "text": "two  spaces and \\\"quotes\\\"", "nil": null\n}';
  const view = render(<CellValue value={value} dataType="jsonb" />);
  expect(view.container.textContent).toContain("9007199254740993");
  expect(view.container.textContent).toContain("1e400");
  expect(view.container.textContent).toContain(
    '"two  spaces and \\\"quotes\\\""',
  );
  expect(view.container.querySelectorAll(".json-token-key")).toHaveLength(4);
  view.rerender(
    <CellValue value={'["' + "a".repeat(10000) + '"]'} dataType="json" />,
  );
  expect(view.container.textContent!.length).toBeLessThan(520);
  expect(screen.getByLabelText("Preview truncated")).toBeTruthy();
  view.rerender(<CellValue value={null} dataType="jsonb" />);
  expect(screen.getByText("NULL")).toBeTruthy();
  view.rerender(<CellValue value="null" dataType="jsonb" />);
  expect(screen.getByText("null").className).toBe("json-token-literal");
  view.rerender(<CellValue value={value} dataType="text" />);
  expect(view.container.querySelector(".json-cell-preview")).toBeNull();
  expect(view.container.textContent).toBe(value);
});
