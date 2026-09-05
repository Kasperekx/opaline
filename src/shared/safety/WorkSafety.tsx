import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConnectionDialog } from "../../features/connections/ConnectionDialog";

export type WorkScope = { sessionId?: string; tabId?: string };
type WorkRisk = WorkScope & {
  label: string;
  dirty?: boolean;
  busy?: boolean;
  save?: () => Promise<boolean>;
  discard?: () => void;
  warning?: string;
};
type RequestOptions = { allowSave?: boolean };
type PendingAction = {
  action: () => void;
  scope: WorkScope;
  options: RequestOptions;
};
type Safety = {
  hasRisks: (scope?: WorkScope) => boolean;
  register: (id: string, read: () => WorkRisk) => () => void;
  request: (
    action: () => void,
    scope?: WorkScope,
    options?: RequestOptions,
  ) => void;
};
const Context = createContext<Safety | null>(null);
const matches = (risk: WorkRisk, scope: WorkScope) =>
  (!scope.sessionId || risk.sessionId === scope.sessionId) &&
  (!scope.tabId || risk.tabId === scope.tabId);

export function WorkSafetyProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, () => WorkRisk>());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [risks, setRisks] = useState<WorkRisk[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const collect = useCallback(
    (scope: WorkScope) =>
      [...registry.current.values()]
        .map((read) => read())
        .filter((risk) => matches(risk, scope) && (risk.dirty || risk.busy)),
    [],
  );
  const register = useCallback((id: string, read: () => WorkRisk) => {
    registry.current.set(id, read);
    return () => {
      registry.current.delete(id);
    };
  }, []);
  const request = useCallback(
    (
      action: () => void,
      scope: WorkScope = {},
      options: RequestOptions = {},
    ) => {
      if (savingRef.current) return;
      const current = collect(scope);
      if (!current.length) {
        action();
        return;
      }
      setRisks(current);
      setSaveError(null);
      setPending({ action, scope, options });
    },
    [collect],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (collect({}).length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [collect]);
  const value = useMemo(
    () => ({
      register,
      request,
      hasRisks: (scope: WorkScope = {}) => collect(scope).length > 0,
    }),
    [register, request, collect],
  );
  const blocked = risks.some((risk) => risk.busy);
  const canSave =
    pending?.options.allowSave !== false &&
    !blocked &&
    risks.filter((risk) => risk.dirty).every((risk) => risk.save);
  return (
    <Context.Provider value={value}>
      {children}
      {pending && (
        <ConnectionDialog
          title={
            blocked
              ? "An operation is still running"
              : canSave
                ? "Save changes before leaving?"
                : "Discard unsaved changes?"
          }
          subtitle="Protect your work"
          busy={saving}
          onClose={() => {
            if (!savingRef.current) setPending(null);
          }}
        >
          <div className="safety-content">
            {saveError && <p role="alert">{saveError}</p>}
            <p>
              {blocked
                ? "Wait for completion or cancel the operation before closing this view."
                : "This view has pending work. Review the details below before continuing."}
            </p>
            <ul>
              {risks.map((risk, index) => (
                <li key={index}>
                  {risk.label}
                  {risk.warning && <p role="alert">{risk.warning}</p>}
                </li>
              ))}
            </ul>
          </div>
          <footer className="dialog-actions">
            <button
              className="button ghost"
              data-initial-focus="true"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              Keep working
            </button>
            {!blocked && (
              <button
                className="button danger"
                disabled={saving}
                onClick={() => {
                  const current = collect(pending.scope);
                  if (current.some((risk) => risk.busy)) {
                    setRisks(current);
                    return;
                  }
                  current.forEach((risk) => risk.discard?.());
                  setPending(null);
                  pending.action();
                }}
              >
                Discard changes
              </button>
            )}
            {canSave && (
              <button
                className="button primary"
                disabled={saving}
                onClick={async () => {
                  if (savingRef.current) return;
                  const current = collect(pending.scope);
                  if (
                    current.some(
                      (risk) => risk.busy || (risk.dirty && !risk.save),
                    )
                  ) {
                    setRisks(current);
                    return;
                  }
                  savingRef.current = true;
                  setSaving(true);
                  setSaveError(null);
                  try {
                    for (const risk of current.filter((item) => item.dirty)) {
                      if (!(await risk.save!())) {
                        setSaveError(
                          "Save was not completed or confirmed. Keep working to review the details.",
                        );
                        return;
                      }
                    }
                    setPending(null);
                    pending.action();
                  } catch {
                    setSaveError(
                      "Could not save all changes. Your drafts are retained.",
                    );
                  } finally {
                    savingRef.current = false;
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : "Save and continue"}
              </button>
            )}
          </footer>
        </ConnectionDialog>
      )}
    </Context.Provider>
  );
}

export function useWorkSafety() {
  const safety = useContext(Context);
  if (!safety) throw new Error("WorkSafetyProvider is required");
  return safety;
}

export function useWorkRisk(risk: WorkRisk) {
  const safety = useWorkSafety();
  const id = useId();
  const latest = useRef(risk);
  useLayoutEffect(() => {
    latest.current = risk;
  });
  useLayoutEffect(
    () => safety.register(id, () => latest.current),
    [id, safety],
  );
}
