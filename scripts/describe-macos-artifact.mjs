// Generated alongside CI installers; never publishes a release or signs a package.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = process.env.GITHUB_SHA;
if (process.platform !== "darwin" || !/^[a-f0-9]{40}$/.test(sha ?? "") || process.env.VITE_BUILD_SHA !== sha) {
  throw new Error("Run on macOS CI with matching explicit GITHUB_SHA and VITE_BUILD_SHA.");
}
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git(["rev-parse", "HEAD"]) !== sha || git(["status", "--porcelain"])) throw new Error("Artifact source must be the exact clean CI commit.");
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const tauri = JSON.parse(await fs.readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = await fs.readFile(path.join(root, "src-tauri/Cargo.toml"), "utf8");
if (pkg.version !== tauri.version || cargo.match(/^version = "([^"]+)"/m)?.[1] !== pkg.version) throw new Error("App version mismatch.");
const directory = path.join(root, "src-tauri/target/release/bundle/dmg");
const names = (await fs.readdir(directory)).filter(name => name.endsWith(".dmg"));
if (names.length !== 1) throw new Error("Expected exactly one architecture-specific installer.");
const installers = [];
for (const name of names) {
  const file = path.join(directory, name);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  installers.push({ name, bytes: (await fs.stat(file)).size, sha256: hash.digest("hex") });
}
const report = { app: "Opaline", version: pkg.version, commit: sha, architecture: process.arch, packageStatus: "unsigned test artifact; not a notarized release", minimumMacOS: "not yet qualified", installers };
await fs.writeFile(path.join(directory, "build-info.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
