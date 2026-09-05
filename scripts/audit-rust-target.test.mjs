import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFindings } from "./audit-rust-target.mjs";
const metadata = {
  packages: [{ id: "app", name: "app", version: "1" }, { id: "used", name: "used", version: "1" }, { id: "other", name: "other", version: "1" }],
  resolve: { root: "app", nodes: [{ id: "app", dependencies: ["used"] }, { id: "used", dependencies: [] }, { id: "other", dependencies: [] }] },
};
const finding = name => ({ advisory: { id: "RUSTSEC-TEST" }, package: { name, version: "1" } });
test("compiled unsound dependencies fail; excluded platforms remain visible", () => {
  const audit = { vulnerabilities: { list: [] }, warnings: { unsound: [finding("used"), finding("other")] } };
  const result = classifyFindings(metadata, audit);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.findings.map(x => x.inTarget), [true, false]);
  audit.warnings.unsound.shift();
  const scoped = classifyFindings(metadata, audit);
  assert.equal(scoped.blocked, false);
  assert.equal(scoped.findings[0].id, "RUSTSEC-TEST");
});
test("compiled vulnerabilities fail regardless of warning policy", () => {
  assert.equal(classifyFindings(metadata, { vulnerabilities: { list: [finding("used")] }, warnings: {} }).blocked, true);
});
test("incomplete security evidence fails closed", () => {
  assert.throws(() => classifyFindings({}, {}));
  assert.throws(() => classifyFindings(metadata, { vulnerabilities: { list: [] }, warnings: { unsound: [{}] } }));
});
