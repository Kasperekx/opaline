import type { ReactNode } from "react";

export function TableErrorNotice({
  title,
  message,
  hint,
  children,
}: {
  title: string;
  message: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="table-error-notice" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{hint}</p>
      </div>
      {children}
      <details>
        <summary>Technical details</summary>
        <pre tabIndex={0}>{message}</pre>
      </details>
    </div>
  );
}
