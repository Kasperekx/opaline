import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inventory } from "./postgres-bundle.mjs";
import { verifyClients } from "./verify-macos-bundle.mjs";

test("packaged client verification rejects corruption, missing versions and wrong architecture", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opaline-package-check-"));
  try {
    const directory = path.join(root, "18");
    for (const folder of ["bin", "licenses"]) await fs.mkdir(path.join(directory, folder), { recursive: true });
    for (const file of ["bin/pg_dump", "bin/pg_restore", "bin/psql", "licenses/PostgreSQL.txt", "licenses/OpenSSL.txt"]) await fs.writeFile(path.join(directory, file), "fixture");
    await fs.writeFile(path.join(directory, "build.json"), JSON.stringify({ target: "darwin-arm64", version: "18.6", sourceSha256: "fixture-hash" }));
    const manifest = { version: 1, target: "darwin-arm64", releases: [{ major: 18, version: "18.6", files: await inventory(directory) }] };
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
    const releases = { "18.6": "fixture-hash" };
    await verifyClients(root, "darwin-arm64", releases);
    await assert.rejects(verifyClients(root, "darwin-x64", releases));
    await assert.rejects(verifyClients(root, "darwin-arm64", { ...releases, "17.11": "other" }));
    await fs.writeFile(path.join(directory, "bin/pg_dump"), "corrupted");
    await assert.rejects(verifyClients(root, "darwin-arm64", releases));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
