import { render as renderComponent } from "@testing-library/react";
import type { ReactElement } from "react";
import { WorkSafetyProvider } from "../src/shared/safety/WorkSafety";

export const render = (ui: ReactElement) =>
  renderComponent(ui, { wrapper: WorkSafetyProvider });
