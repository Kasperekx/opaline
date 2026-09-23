import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { verifyBetaArtifact } from "./verify-beta-artifact.mjs";

test("beta assets require matching source, architecture and actual file hash", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opaline-beta-test-"));
  const sha = "a".repeat(40);
  const name = "Opaline_0.1.0-beta.1_aarch64.dmg";
  const contents = "synthetic installer";
  const sha256 = createHash("sha256").update(contents).digest("hex");
  const report = {
    app: "Opaline", commit: sha, version: "0.1.0-beta.1", architecture: "arm64",
    packageStatus: "unsigned test artifact; not a notarized release",
    installers: [{ name, bytes: contents.length, sha256 }],
  };
  const writeReport = () => fs.writeFile(path.join(directory, "build-info.json"), JSON.stringify(report));
  try {
    await fs.writeFile(path.join(directory, name), contents);
    await writeReport();
    assert.equal(await verifyBetaArtifact(directory, sha, report.version), `${sha256}  ${name}\n`);
    await assert.rejects(verifyBetaArtifact(directory, "b".repeat(40), report.version), /commit mismatch/);
    report.architecture = "x64";
    await writeReport();
    await assert.rejects(verifyBetaArtifact(directory, sha, report.version), /Apple Silicon/);
    report.architecture = "arm64";
    report.installers[0].name = "../outside.dmg";
    await writeReport();
    await assert.rejects(verifyBetaArtifact(directory, sha, report.version));
    report.installers[0].name = name;
    await writeReport();
    await fs.writeFile(path.join(directory, name), "X".repeat(contents.length));
    await assert.rejects(verifyBetaArtifact(directory, sha, report.version), /checksum mismatch/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
