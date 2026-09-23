import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute, inventory } from "./postgres-bundle.mjs";
import { verifyClients, verifySignature } from "./verify-macos-bundle.mjs";

test("default macOS check rejects an unsealed or modified app and accepts a complete ad-hoc seal", { skip: process.platform !== "darwin" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opaline-signature-test-"));
  const app = path.join(root, "Fixture.app");
  const contents = path.join(app, "Contents");
  try {
    await fs.mkdir(path.join(contents, "MacOS"), { recursive: true });
    await fs.mkdir(path.join(contents, "Resources"));
    const executable = path.join(contents, "MacOS", "fixture");
    await fs.copyFile("/usr/bin/true", executable);
    await execute("codesign", ["--force", "--sign", "-", executable]);
    await fs.writeFile(path.join(contents, "Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleIdentifier</key><string>app.opaline.signature-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const resource = path.join(contents, "Resources", "fixture.txt");
    await fs.writeFile(resource, "original");
    await assert.rejects(verifySignature(app));
    await execute("codesign", ["--force", "--sign", "-", app]);
    await verifySignature(app);
    await fs.writeFile(resource, "modified");
    await assert.rejects(verifySignature(app));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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
