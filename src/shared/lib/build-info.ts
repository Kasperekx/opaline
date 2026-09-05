const supplied = import.meta.env.VITE_BUILD_SHA;
export const buildCommit =
  typeof supplied === "string" && /^[a-f0-9]{40}$/.test(supplied)
    ? supplied
    : "local development (unversioned)";
