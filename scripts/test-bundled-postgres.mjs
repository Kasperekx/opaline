// Opt-in integration test. Only containers created by this invocation are modified.
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execute } from "./postgres-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await fs.mkdtemp(
  path.join(os.tmpdir(), "opaline-bundled-test-"),
);
const bundle = path.join(scratch, "Relocated app resources", "postgres");
const containerIds = [];
const run = async (program, args, options = {}) => {
  try {
    const result = await execute(program, args, {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 300000,
      ...options,
    });
    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      program +
        " failed: " +
        String(error.stdout ?? "").slice(-4000) +
        String(error.stderr ?? "").slice(-4000),
    );
  }
};
try {
  await fs.cp(path.join(root, "src-tauri/resources/postgres"), bundle, {
    recursive: true,
  });
  const ca = path.join(scratch, "ca.pem");
  const key = path.join(scratch, "server.key");
  const cert = path.join(scratch, "server.pem");
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=Opaline disposable test CA",
    "-keyout",
    path.join(scratch, "ca.key"),
    "-out",
    ca,
  ]);
  await run("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    "/CN=localhost",
    "-keyout",
    key,
    "-out",
    path.join(scratch, "server.csr"),
  ]);
  await fs.writeFile(
    path.join(scratch, "server.ext"),
    "subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n",
  );
  await run("openssl", [
    "x509",
    "-req",
    "-days",
    "1",
    "-in",
    path.join(scratch, "server.csr"),
    "-CA",
    ca,
    "-CAkey",
    path.join(scratch, "ca.key"),
    "-CAcreateserial",
    "-extfile",
    path.join(scratch, "server.ext"),
    "-out",
    cert,
  ]);
  await fs.chmod(key, 0o600);
  for (const major of [14, 15, 16, 17, 18]) {
    console.log(
      "Testing bundled clients against PostgreSQL " +
        major +
        " on a disposable server…",
    );
    const id = await run("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      "opaline-bundled-test-" + randomUUID(),
      "--label",
      "app.opaline.disposable-test=true",
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_PASSWORD=opaline_test",
      "postgres:" + major,
    ]);
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error("Unexpected disposable container identifier");
    containerIds.push(id);
    const ready = async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          await run(
            "docker",
            ["exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
            {
              timeout: 5000,
            },
          );
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      throw new Error("Disposable PostgreSQL did not become ready");
    };
    await ready();
    await run("docker", ["cp", key, id + ":/tmp/opaline-test.key"]);
    await run("docker", ["cp", cert, id + ":/tmp/opaline-test.pem"]);
    await run("docker", [
      "exec",
      "--user",
      "root",
      id,
      "chown",
      "postgres:postgres",
      "/tmp/opaline-test.key",
      "/tmp/opaline-test.pem",
    ]);
    for (const sql of [
      "ALTER SYSTEM SET ssl=on",
      "ALTER SYSTEM SET ssl_cert_file='/tmp/opaline-test.pem'",
      "ALTER SYSTEM SET ssl_key_file='/tmp/opaline-test.key'",
    ]) {
      await run("docker", [
        "exec",
        id,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ]);
    }
    await run("docker", ["restart", id]);
    await ready();
    const address = await run("docker", ["port", id, "5432/tcp"]);
    const port = Number(address.split(":").at(-1));
    if (!address.startsWith("127.0.0.1:") || !port || port === 5432)
      throw new Error("Unsafe test port");
    const env = {
      ...process.env,
      OPALINE_TEST_POSTGRES_PORT: String(port),
      OPALINE_TEST_TLS_PORT: String(port),
      OPALINE_TEST_PG_TOOLS: path.join(bundle, String(major), "bin"),
      OPALINE_TEST_BUNDLED_ROOT: bundle,
      OPALINE_TEST_CA_PATH: ca,
    };
    for (const filter of ["backup::tests", "tls_tests", "session_tests"]) {
      const output = await run(
        "cargo",
        [
          "test",
          "--locked",
          "--manifest-path",
          "src-tauri/Cargo.toml",
          "--lib",
          filter,
          "--",
          "--ignored",
          "--test-threads=1",
        ],
        { env },
      );
      console.log(
        "PostgreSQL " +
          major +
          " / " +
          filter +
          ": " +
          output.split("\n").find((line) => line.startsWith("test result:")),
      );
    }
    await run("docker", ["rm", "--force", id]);
    containerIds.splice(containerIds.indexOf(id), 1);
  }
  console.log(
    "All 5 majors passed with relocated bundled clients, real backup/restore, TLS and session isolation.",
  );
} finally {
  for (const id of containerIds) await run("docker", ["rm", "--force", id]);
  // Only this test's freshly-created directory, certificates and disposable data.
  await fs.rm(scratch, { recursive: true, force: true });
}
