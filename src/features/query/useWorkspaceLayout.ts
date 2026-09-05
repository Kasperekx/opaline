import { useCallback, useEffect, useState } from "react";
import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";

const STORAGE_KEY = "opaline.workspace-layout.v1";
const DEFAULT_EXPLORER_WIDTH = 300;
const DEFAULT_EDITOR_RATIO = 48;

type WorkspaceLayout = {
  explorerWidth: number;
  editorRatio: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const loadLayout = (): WorkspaceLayout => {
  const value = readLocalJson<unknown>(STORAGE_KEY, null);
  const stored =
    value && typeof value === "object"
      ? (value as Partial<WorkspaceLayout>)
      : {};
  return {
    explorerWidth: clamp(
      Number(stored.explorerWidth) || DEFAULT_EXPLORER_WIDTH,
      240,
      440,
    ),
    editorRatio: clamp(
      Number(stored.editorRatio) || DEFAULT_EDITOR_RATIO,
      25,
      75,
    ),
  };
};

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(loadLayout);

  useEffect(() => {
    writeLocalJson(STORAGE_KEY, layout);
  }, [layout]);

  const resizeExplorer = useCallback((delta: number) => {
    setLayout((current) => ({
      ...current,
      explorerWidth: clamp(current.explorerWidth + delta, 240, 440),
    }));
  }, []);

  const resizeEditor = useCallback((deltaPercent: number) => {
    setLayout((current) => ({
      ...current,
      editorRatio: clamp(current.editorRatio + deltaPercent, 25, 75),
    }));
  }, []);

  const resetExplorer = useCallback(
    () =>
      setLayout((current) => ({
        ...current,
        explorerWidth: DEFAULT_EXPLORER_WIDTH,
      })),
    [],
  );
  const resetEditor = useCallback(
    () =>
      setLayout((current) => ({
        ...current,
        editorRatio: DEFAULT_EDITOR_RATIO,
      })),
    [],
  );

  return {
    ...layout,
    resizeExplorer,
    resizeEditor,
    resetExplorer,
    resetEditor,
  };
}
