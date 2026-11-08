import { readLocalJson, writeLocalJson } from "../../shared/lib/local-storage";

/* The profile last opened in each workspace, so the library preselects it
   and Return reopens it. A convenience only: malformed entries are ignored
   and a failed write changes nothing else. */
const key = "opaline.last-profile.v1";

export type LastProfiles = Record<string, string>;

export function readLastProfiles(): LastProfiles {
  try {
    const value = readLocalJson<unknown>(key, {});
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** Records the choice and returns the updated map. */
export function rememberProfile(
  workspaceId: string,
  profileId: string,
): LastProfiles {
  const all = readLastProfiles();
  if (all[workspaceId] === profileId) return all;
  const next = { ...all, [workspaceId]: profileId };
  try {
    writeLocalJson(key, next);
  } catch {
    /* Preselection is optional; connecting must never depend on it. */
  }
  return next;
}
