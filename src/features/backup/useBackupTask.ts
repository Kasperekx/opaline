import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../shared/lib/database-api";
import { useWorkRisk, useWorkSafety } from "../../shared/safety/WorkSafety";
import { useOperationLock } from "../../shared/hooks/useOperationLock";
import {
  backupApi,
  type JobProgress,
  type JobResult,
  type RestorePreview,
  type ToolInfo,
} from "./backup-api";
export function useBackupTask(sessionId: string) {
  const [tools, setTools] = useState<ToolInfo | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const previewRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const safety = useWorkSafety();
  const lock = useOperationLock();
  useWorkRisk({ sessionId, label: "Backup / restore task", busy });
  useEffect(
    () => () => {
      if (previewRef.current)
        void backupApi.release(previewRef.current).catch(() => undefined);
    },
    [],
  );
  const act = (action: () => Promise<void>) =>
    lock(async () => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (error) {
        setError(errorMessage(error));
      } finally {
        setBusy(false);
      }
    });
  const onProgress = (event: JobProgress) => {
    setProgress(event);
    setLog((entries) =>
      entries[entries.length - 1] === event.stage
        ? entries
        : [...entries.slice(-19), event.stage],
    );
  };
  return {
    tools,
    preview,
    busy,
    running,
    cancelling,
    progress,
    log,
    error,
    result,
    chooseTools: (choose: () => Promise<string | null>) =>
      act(async () => {
        const directory = await choose();
        if (!directory) return;
        setTools(null);
        setTools(await backupApi.tools(sessionId, directory));
      }),
    useAutomaticTools: () => {
      if (!busy) {
        setTools(null);
        setError(null);
      }
    },
    prepare: (choose: () => Promise<string | null>) =>
      act(async () => {
        const path = await choose();
        if (!path) return;
        if (previewRef.current) await backupApi.release(previewRef.current);
        previewRef.current = null;
        setPreview(null);
        setResult(null);
        setRunning(true);
        setCancelling(false);
        setProgress(null);
        try {
          const prepared = await backupApi.prepare(
            sessionId,
            tools?.id ?? null,
            path,
          );
          previewRef.current = prepared.id;
          setPreview(prepared);
        } finally {
          setRunning(false);
        }
      }),
    run: (
      operation: (
        onProgress: (event: JobProgress) => void,
      ) => Promise<JobResult | null>,
      restore = false,
    ) => {
      if (safety.hasRisks()) {
        setError(
          "Finish or discard unsaved file/table/form changes and wait for active operations before starting database maintenance.",
        );
        return;
      }
      return act(async () => {
        setResult(null);
        setLog([]);
        setProgress(null);
        setRunning(true);
        setCancelling(false);
        try {
          const outcome = await operation(onProgress);
          setResult(outcome);
        } finally {
          setRunning(false);
          if (restore && previewRef.current) {
            void backupApi.release(previewRef.current).catch(() => undefined);
            previewRef.current = null;
            setPreview(null);
          }
        }
      });
    },
    cancel: async () => {
      setCancelling(true);
      try {
        if (!(await backupApi.cancel(sessionId))) {
          setCancelling(false);
          setError(
            "The client has not started yet or is finalizing. Wait for the outcome; retry Cancel if it is still running.",
          );
        }
      } catch (error) {
        setCancelling(false);
        setError(errorMessage(error));
      }
    },
  };
}
