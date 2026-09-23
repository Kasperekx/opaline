import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyBetaArtifact(directory, sha, version) {
  assert.match(sha ?? "", /^[a-f0-9]{40}$/, "Missing source commit");
  assert.equal(version, "0.1.0-beta.1", "Only the reviewed first beta is supported");
  const report = JSON.parse(await fs.readFile(path.join(directory, "build-info.json"), "utf8"));
  assert.equal(report.app, "Opaline");
  assert.equal(report.commit, sha, "Artifact commit mismatch");
  assert.equal(report.version, version, "Artifact version mismatch");
  assert.equal(report.architecture, "arm64", "First beta is Apple Silicon only");
  assert.equal(report.packageStatus, "unsigned test artifact; not a notarized release");
  assert.equal(report.installers.length, 1);
  const installer = report.installers[0];
  assert.match(installer.name, /^Opaline_[a-zA-Z0-9.-]+_aarch64\.dmg$/);
  const names = (await fs.readdir(directory)).filter(name => name.endsWith(".dmg"));
  assert.deepEqual(names, [installer.name], "Unexpected installer assets");
  const file = path.join(directory, installer.name);
  assert.equal((await fs.lstat(file)).isFile(), true, "Installer must be a regular file");
  assert.equal((await fs.stat(file)).size, installer.bytes);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const checksum = hash.digest("hex");
  assert.equal(checksum, installer.sha256, "Installer checksum mismatch");
  return `${checksum}  ${installer.name}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  assert.ok(directory, "Pass the downloaded artifact directory");
  const pkg = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const checksums = await verifyBetaArtifact(directory, process.env.GITHUB_SHA, pkg.version);
  await fs.writeFile(path.join(directory, "SHA256SUMS.txt"), checksums);
  console.log("Verified Apple Silicon beta artifact identity and checksum.");
}
