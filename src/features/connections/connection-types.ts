import type { ConnectionInfo } from "../../shared/types/database";

export type Environment = "local" | "staging" | "production";
export type ProductWorkspace = { id: string; name: string };
export type ConnectionSettings = {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: "disable" | "prefer" | "require";
  caPath: string | null;
  environment: Environment;
  readOnly: boolean;
};
export type ConnectionProfile = ConnectionSettings & {
  requiresCa?: boolean;
  id: string;
  workspaceId: string;
  credentialId: string | null;
};
export type ConnectionCatalog = {
  credentialWarning?: string | null;
  version: number;
  workspaces: ProductWorkspace[];
  profiles: ConnectionProfile[];
};
export type ProfileInput = ConnectionSettings & {
  id: string | null;
  workspaceId: string;
  password: string | null;
  passwordAction: "keep" | "store" | "forget";
};
export type SessionInfo = ConnectionInfo & {
  id: string;
  profileId: string;
  workspaceId: string;
  environment: Environment;
  readOnly: boolean;
};
export type SessionStatus = "active" | "busy" | "lost" | "unknown";
export const environments: Environment[] = ["local", "staging", "production"];
export const environmentLabels: Record<Environment, string> = {
  local: "Local",
  staging: "Staging",
  production: "Production",
};
export const newProfile = (workspaceId: string): ProfileInput => ({
  id: null,
  workspaceId,
  name: "",
  host: "localhost",
  port: 5432,
  database: "postgres",
  username: "postgres",
  sslMode: "prefer",
  caPath: null,
  environment: "local",
  readOnly: false,
  password: "",
  passwordAction: "forget",
});
export const profileInput = (
  profile: ConnectionProfile,
  duplicate = false,
): ProfileInput => {
  const { credentialId, ...settings } = profile;
  return {
    ...settings,
    id: duplicate ? null : profile.id,
    name: duplicate ? profile.name + " copy" : profile.name,
    password: duplicate ? "" : null,
    passwordAction: !duplicate && credentialId ? "keep" : "forget",
  };
};
