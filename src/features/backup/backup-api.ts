import { Channel, invoke } from "@tauri-apps/api/core";
export type ToolInfo = {
  id: string;
  directory: string;
  version: string;
  major: number;
  source: "bundled" | "custom";
};
export type DumpFormat = "custom" | "sql";
export type RestorePreview = {
  id: string;
  format: DumpFormat;
  bytes: number;
  digest: string;
  preview: string;
  serverMajor: number;
};
export type JobProgress = { stage: string; elapsedMs: number; message: string };
export type JobResult = { bytes: number; durationMs: number; message: string };
export type DumpOptions = {
  toolsId: string | null;
  path: string;
  format: DumpFormat;
  content: "all" | "schema" | "data";
  schemas: string[];
  tables: { schema: string; table: string }[];
  password: string | null;
};
export type RestoreOptions = {
  preparedId: string;
  password: string | null;
  trustedFile: boolean;
  confirmDatabase: string;
  confirmProduction: boolean;
  allowNonempty: boolean;
  clean: boolean;
  confirmClean: boolean;
  preserveOwnership: boolean;
};
export const backupApi = {
  tools: (sessionId: string, directory: string | null = null) =>
    invoke<ToolInfo>("backup_tools", { sessionId, directory }),
  prepare: (sessionId: string, toolsId: string | null, path: string) =>
    invoke<RestorePreview>("prepare_restore", { sessionId, toolsId, path }),
  release: (id: string) => invoke<void>("release_restore", { id }),
  cancel: (sessionId: string) =>
    invoke<boolean>("cancel_backup", { sessionId }),
  dump: (
    sessionId: string,
    input: DumpOptions,
    onProgress: (event: JobProgress) => void,
  ) =>
    invoke<JobResult>("dump_database", {
      sessionId,
      input,
      onProgress: new Channel(onProgress),
    }),
  restore: (
    sessionId: string,
    input: RestoreOptions,
    onProgress: (event: JobProgress) => void,
  ) =>
    invoke<JobResult>("restore_database", {
      sessionId,
      input,
      onProgress: new Channel(onProgress),
    }),
};
