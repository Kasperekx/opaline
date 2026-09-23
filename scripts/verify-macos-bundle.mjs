// Verify the packaged resources, not just the developer build directory.
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execute, inventory } from "./postgres-bundle.mjs";

export async function verifyClients(directory, target, releases) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest.version, 1, "Unsupported bundle manifest");
  assert.equal(manifest.target, target, "Wrong client architecture");
  const versions = Object.keys(releases);
  assert.deepEqual(manifest.releases.map(item => item.version).sort(), versions.sort(), "Incomplete client versions");
  for (const item of manifest.releases) {
    assert.equal(item.major, Number(item.version.split(".")[0]));
    const root = path.join(directory, String(item.major));
    assert.deepEqual(await inventory(root), item.files, "Packaged client integrity mismatch");
    const build = JSON.parse(await fs.readFile(path.join(root, "build.json"), "utf8"));
    assert.equal(build.sourceSha256, releases[item.version], "Wrong source checksum");
    assert.equal(build.target, target);
    assert.equal(build.version, item.version);
    for (const file of ["bin/pg_dump", "bin/pg_restore", "bin/psql", "licenses/PostgreSQL.txt", "licenses/OpenSSL.txt"]) {
      assert.ok(item.files.some(entry => entry.path === file), "Missing packaged file: " + file);
    }
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.platform, "darwin", "Run the installer acceptance check on macOS");
  const app = path.resolve(process.argv[2] ?? "src-tauri/target/release/bundle/macos/Opaline.app");
  assert.ok(app.endsWith(".app"), "Pass the installed .app directory");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const releases = JSON.parse(await fs.readFile(path.join(root, "scripts/postgres-releases.json"), "utf8"));
  const clients = path.join(app, "Contents/Resources/postgres");
  const manifest = await verifyClients(clients, "darwin-" + process.arch, releases);
  for (const item of manifest.releases) {
    for (const name of ["pg_dump", "pg_restore", "psql"]) {
      const file = path.join(clients, String(item.major), "bin", name);
      const { stdout } = await execute(file, ["--version"], { env: {}, timeout: 10000 });
      assert.ok(stdout.trim().endsWith(item.version), "Packaged tool version mismatch");
    }
  }
  if (process.argv.includes("--release")) {
    await execute("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
    await execute("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
    await execute("xcrun", ["stapler", "validate", app]);
  }
  console.log("Packaged clients: integrity, licenses, architecture and clean-environment launch passed.");
  console.log(process.argv.includes("--release") ? "Signature, Gatekeeper and stapled ticket passed; manual acceptance still required." : "Development check only: signing/notarization NOT verified.");
}
