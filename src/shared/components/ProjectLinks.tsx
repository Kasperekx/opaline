import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

// Keep in sync with the exact URL allowlist in capabilities/default.json.
const pages = [
  {
    label: "Report a bug",
    url: "https://github.com/Kasperekx/opaline/issues/new/choose",
  },
  {
    label: "Tester guide",
    url: "https://github.com/Kasperekx/opaline/blob/main/docs/tester-guide.md",
  },
];

export function ProjectLinks() {
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  return (
    <section aria-label="Project and feedback">
      <h3>Feedback</h3>
      <p>
        Reports are public on GitHub. Remove private data from screenshots and
        reproduction steps. No diagnostics are sent automatically.
      </p>
      <div className="project-links">
        {pages.map(({ label, url }) => (
          <button
            key={url}
            className="button secondary"
            disabled={opening}
            onClick={() => {
              setOpening(true);
              setError("");
              void openUrl(url)
                .catch(() =>
                  setError(`Could not open the browser. Visit ${url}`),
                )
                .finally(() => setOpening(false));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
