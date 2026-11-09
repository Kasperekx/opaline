import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isDesktopRuntime } from "./shared/lib/database-api";
import { trackWindowActivity } from "./shared/lib/window-activity";

// The macOS window is transparent with a native sidebar material behind it.
// Other platforms (and the browser preview) keep a solid window colour.
if (isDesktopRuntime() && /Macintosh|Mac OS X/.test(navigator.userAgent))
  document.documentElement.dataset.material = "native";
trackWindowActivity();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
