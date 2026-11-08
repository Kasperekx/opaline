import { useId } from "react";
import type { RestoreJobs } from "./backup-api";

export function RestoreExecution({
  jobs,
  consent,
  onJobsChange,
  onConsentChange,
}: {
  jobs: RestoreJobs;
  consent: boolean;
  onJobsChange: (jobs: RestoreJobs) => void;
  onConsentChange: (consent: boolean) => void;
}) {
  const selectId = useId();
  const descriptionId = useId();
  return (
    <section className="backup-section restore-execution">
      <label className="backup-caption" htmlFor={selectId}>
        Restore mode
      </label>
      <select
        id={selectId}
        className="backup-select"
        value={jobs}
        aria-describedby={descriptionId}
        onChange={(event) => {
          onJobsChange(Number(event.target.value) as RestoreJobs);
          onConsentChange(false);
        }}
      >
        <option value={1}>Safe restore · one transaction</option>
        <option value={2}>Parallel restore · 2 workers</option>
        <option value={4}>Parallel restore · 4 workers</option>
      </select>
      <p id={descriptionId} className="backup-note">
        {jobs === 1
          ? "Restores the archive in one transaction and stops on error. The default for every restore."
          : "Loads tables and builds indexes concurrently. Best suited to multi-table archives; more workers are not always faster. Uses additional server connections and resources."}
      </p>
      {jobs > 1 && (
        <div className="backup-group">
          <label className="backup-check danger">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => onConsentChange(event.target.checked)}
            />
            <span>
              I accept that a failed or cancelled parallel restore can leave
              partially restored data. This new database will be kept for
              inspection.
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
