// Audit the dependency graph actually compiled for a release target. Findings
// outside that graph remain reported; they are not advisory-ID exceptions.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function classifyFindings(metadata, audit) {
  if (!metadata.resolve?.root || !Array.isArray(metadata.resolve.nodes)
      || !Array.isArray(audit.vulnerabilities?.list) || !audit.warnings) {
    throw new Error("Incomplete metadata/audit report; refusing to pass the security gate.");
  }
  const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
  const reachable = new Set();
  const visit = id => {
    if (reachable.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw new Error("Missing dependency node: " + id);
    reachable.add(id);
    for (const dependency of node.dependencies) visit(dependency);
  };
  visit(metadata.resolve.root);
  const packages = new Map(metadata.packages.map(pkg => [pkg.id, pkg]));
  const compiled = new Set([...reachable].map(id => {
    const pkg = packages.get(id);
    if (!pkg?.name || !pkg.version) throw new Error("Missing package identity: " + id);
    return pkg.name + "@" + pkg.version;
  }));
  const findings = [
    ...audit.vulnerabilities.list.map(finding => ({ ...finding, kind: "vulnerability" })),
    ...Object.entries(audit.warnings).flatMap(([kind, entries]) => entries.map(finding => ({ ...finding, kind }))),
  ];
  const scoped = findings.map(finding => {
    if (!finding.package?.name || !finding.package.version || !finding.advisory?.id) throw new Error("Unrecognized advisory record.");
    return { id: finding.advisory.id, package: finding.package.name + "@" + finding.package.version,
      kind: finding.kind, inTarget: compiled.has(finding.package.name + "@" + finding.package.version) };
  });
  return { packages: compiled.size, findings: scoped,
    blocked: scoped.some(finding => finding.inTarget && ["vulnerability", "unsound", "yanked"].includes(finding.kind)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target || !/^[a-z0-9_]+(?:-[a-z0-9_]+){2,}$/.test(target)) throw new Error("Pass an explicit Rust release target triple.");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const options = { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 180000 };
  const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--locked", "--manifest-path", "src-tauri/Cargo.toml", "--format-version", "1", "--filter-platform", target], options));
  const audit = spawnSync("cargo", ["audit", "--file", "src-tauri/Cargo.lock", "--json"], options);
  if (audit.error || audit.signal || ![0, 1].includes(audit.status)) throw new Error("cargo audit did not complete: " + (audit.error?.message ?? audit.stderr));
  const report = classifyFindings(metadata, JSON.parse(audit.stdout));
  console.log(JSON.stringify({ target, ...report }, null, 2));
  if (report.blocked) process.exitCode = 1;
}
