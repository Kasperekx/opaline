import { expect, it } from "vitest";
import { errorMessage } from "../src/shared/lib/database-api";

it("preserves readable string, JS and serialized Tauri errors", () => {
  expect(errorMessage("Read failed")).toBe("Read failed");
  expect(errorMessage(new Error("Connection lost"))).toBe("Connection lost");
  expect(
    errorMessage({
      kind: "rejected",
      message: "A required column has no value.",
    }),
  ).toBe("A required column has no value.");
});

it("retains SQLSTATE and recovery hints without serializing sensitive fields", () => {
  expect(
    errorMessage({
      message: "Access denied.",
      code: "42501",
      hint: "Check table privileges.",
      detail: "secret row",
      password: "secret password",
      sql: "secret query",
    }),
  ).toBe("Access denied.\nCheck table privileges.\nSQLSTATE 42501");
  expect(
    errorMessage({ message: "Access denied. SQLSTATE 42501", code: "42501" }),
  ).toBe("Access denied. SQLSTATE 42501");
});

it("handles unknown and malformed rejections without encouraging a blind write retry", () => {
  for (const error of [
    null,
    undefined,
    {},
    " ",
    { message: 1 },
    { password: "secret" },
  ]) {
    const message = errorMessage(error);
    expect(message).toContain("verify the database state");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("[object Object]");
  }
  expect(errorMessage({ message: "Failed", code: "secret" })).toBe("Failed");
});
