import type { ReactNode } from "react";
import { CopyButton } from "../../shared/components/CopyButton";

export function TableErrorNotice({
  title,
  message,
  hint,
  context,
  children,
}: {
  title: string;
  message: string;
  hint?: string;
  context?: string;
  children?: ReactNode;
}) {
  return (
    <div className="table-error-notice" role="alert">
      <div>
        <strong>{title}</strong>
        <p className="table-error-message">{message}</p>
        {hint && <p>{hint}</p>}
      </div>
      {children}
      {context && (
        <details>
          <summary>Diagnostic context</summary>
          <pre tabIndex={0}>{context}</pre>
          <p>
            Review object names before sharing. No row values, filter values or
            credentials are included in this context.
          </p>
          <CopyButton
            value={`${title}\n${message}\n\n${context}`}
            label="Copy diagnostic details"
          />
        </details>
      )}
    </div>
  );
}
