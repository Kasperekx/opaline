import { LockKeyhole, TriangleAlert } from "lucide-react";
import { environmentLabels, type Environment } from "./connection-types";

export function EnvironmentBadge({
  environment,
  readOnly = false,
}: {
  environment: Environment;
  readOnly?: boolean;
}) {
  return (
    <span className={"environment-badge env-" + environment}>
      {environment === "production" ? <TriangleAlert size={13} /> : <i />}
      {environmentLabels[environment]}
      {readOnly && (
        <>
          <span className="badge-divider" />
          <LockKeyhole size={12} /> Read-only
        </>
      )}
    </span>
  );
}
