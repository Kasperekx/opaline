import { invoke } from "@tauri-apps/api/core";
import type { ConnectionInfo } from "../../shared/types/database";
import type {
  ConnectionCatalog,
  ProfileInput,
  SessionInfo,
  SessionStatus,
} from "./connection-types";

export const connectionApi = {
  move: (id: string, workspaceId: string) =>
    invoke<ConnectionCatalog>("move_profile", { id, workspaceId }),
  removeWorkspace: (id: string, destination: string | null) =>
    invoke<ConnectionCatalog>("remove_workspace", { id, destination }),
  catalog: () => invoke<ConnectionCatalog>("connection_catalog"),
  sessions: () => invoke<SessionInfo[]>("active_connections"),
  statuses: () =>
    invoke<{ id: string; status: SessionStatus }[]>("connection_statuses"),
  workspace: (id: string | null, name: string) =>
    invoke<ConnectionCatalog>("save_workspace", { id, name }),
  test: (input: ProfileInput) =>
    invoke<ConnectionInfo>("test_profile", { input }),
  save: (input: ProfileInput) =>
    invoke<ConnectionCatalog>("save_profile", { input }),
  delete: (id: string) => invoke<ConnectionCatalog>("delete_profile", { id }),
  connect: (
    profileId: string,
    password: string | null,
    confirmProductionWrite: boolean,
  ) =>
    invoke<SessionInfo>("connect_profile", {
      profileId,
      password,
      confirmProductionWrite,
    }),
  disconnect: (sessionId: string) =>
    invoke<void>("disconnect_postgres", { sessionId }),
};
