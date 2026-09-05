import { useId } from "react";
import { useWorkRisk, useWorkSafety } from "./WorkSafety";

export function useFormSafety(label: string, dirty: boolean, busy: boolean) {
  const sessionId = `form:${useId()}`;
  const safety = useWorkSafety();
  useWorkRisk({ sessionId, label, dirty, busy });
  return (close: () => void) => safety.request(close, { sessionId });
}
