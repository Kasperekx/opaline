import { useState } from "react";
import {
  errorMessage,
  type createDatabaseApi,
} from "../../shared/lib/database-api";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import { useWorkRisk, useWorkSafety } from "../../shared/safety/WorkSafety";
import type {
  NamespaceChange,
  NamespaceDropMode,
  NamespaceKind,
  NamespacePlan,
} from "../../shared/types/structure";

export type NamespaceChangeOptions = {
  mode: NamespaceKind;
  initialName?: string;
  sessionId: string;
  online: boolean;
  readOnly: boolean;
  api: ReturnType<typeof createDatabaseApi>;
  onClose: () => void;
  onApplied: (change: NamespaceChange) => void;
};

export function useNamespaceChange({
  mode,
  initialName = "",
  sessionId,
  online,
  readOnly,
  api,
  onClose,
  onApplied,
}: NamespaceChangeOptions) {
  const lock = useOperationLock();
  const safety = useWorkSafety();
  const [name, setName] = useState(initialName);
  const [newName, setNewName] = useState(initialName);
  const [dropMode, setDropMode] = useState<NamespaceDropMode>("restrict");
  const [cascadeAck, setCascadeAck] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [plan, setPlan] = useState<NamespacePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing identifiers may contain intentional spaces; never change the target.
  const change: NamespaceChange = {
    kind: mode,
    name: mode === "create" ? name.trim() : initialName,
    newName: mode === "rename" ? newName.trim() : null,
    dropMode: mode === "drop" ? dropMode : "restrict",
  };
  const editable = !readOnly && online && !unknown;
  const valid =
    Boolean(change.name.trim()) &&
    (mode !== "rename" ||
      (newName !== initialName &&
        Boolean(change.newName && change.newName !== change.name)));
  const confirmReady =
    mode !== "drop" ||
    (confirmation === change.name && (dropMode !== "cascade" || cascadeAck));

  useWorkRisk({
    sessionId,
    tabId: "namespace-dialog",
    label: "Schema change",
    dirty: true,
    busy,
    discard: onClose,
    warning: unknown
      ? "Commit outcome is unknown. Inspect the database before retrying."
      : undefined,
  });

  const back = () => {
    if (busy || unknown) return;
    setPlan(null);
    setConfirmation("");
    setCascadeAck(false);
    setError(null);
  };
  const review = () =>
    void lock(async () => {
      if (!editable || !valid || plan) return;
      setBusy(true);
      setError(null);
      try {
        setPlan(await api.previewNamespaceChange(change));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    });
  const apply = () =>
    void lock(async () => {
      if (!plan || !editable || !confirmReady) return;
      if (safety.hasRisks({ sessionId, excludeTabId: "namespace-dialog" })) {
        setError(
          "Save or discard other pending work and wait for running operations before changing schemas.",
        );
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.applyNamespaceChange(
          change,
          mode === "drop" ? confirmation : "",
        );
        onApplied(change);
        onClose();
      } catch (e) {
        setError(errorMessage(e));
        if ((e as { kind?: string } | null)?.kind !== "rejected")
          setUnknown(true);
      } finally {
        setBusy(false);
      }
    });

  return {
    name,
    newName,
    change,
    dropMode,
    cascadeAck,
    confirmation,
    plan,
    busy,
    unknown,
    error,
    editable,
    valid,
    confirmReady,
    setCascadeAck,
    setConfirmation,
    review,
    apply,
    back,
    setName(value: string) {
      if (busy || unknown || plan) return;
      (mode === "rename" ? setNewName : setName)(value);
      setError(null);
    },
    setDropMode(value: NamespaceDropMode) {
      if (busy || unknown || plan) return;
      setDropMode(value);
      setCascadeAck(false);
      setConfirmation("");
      setError(null);
    },
  };
}
