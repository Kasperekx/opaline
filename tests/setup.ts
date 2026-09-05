import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";

// jsdom does not implement layout scrolling; real viewport behavior is checked in the browser.
HTMLElement.prototype.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  clearMocks();
  localStorage.clear();
  vi.restoreAllMocks();
});
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
