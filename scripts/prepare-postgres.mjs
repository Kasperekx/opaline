import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  bundleClients,
  digest,
  execute,
  inventory,
} from "./postgres-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releases = JSON.parse(
  await fs.readFile(path.join(root, "scripts/postgres-releases.json"), "utf8"),
);
const target = process.platform + "-" + process.arch;
if (
  ![
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
    "win32-x64",
  ].includes(target)
)
  throw new Error("Unsupported PostgreSQL build target: " + target);
const destination = path.join(root, "src-tauri/resources/postgres");
const cache = path.join(root, "work/managed-postgres", target);
const jobs = Math.max(
  1,
  Math.min(6, Math.floor(os.availableParallelism() / 2)),
);
const windows = process.platform === "win32";
await fs.mkdir(cache, { recursive: true });
await fs.mkdir(destination, { recursive: true });
const posix = (value) =>
  windows
    ? value
        .replaceAll("\\", "/")
        .replace(/^([A-Za-z]):/, (_, drive) => "/" + drive.toLowerCase())
    : value;
let dependencyDirectories = [];
let buildEnvironment = { ...process.env, LC_ALL: "C" };
if (process.platform === "darwin") {
  const prefix =
    process.env.OPALINE_OPENSSL_PREFIX ??
    (await execute("brew", ["--prefix", "openssl@3"])).stdout.trim();
  dependencyDirectories = [path.join(prefix, "lib")];
  buildEnvironment = {
    ...buildEnvironment,
    CPPFLAGS: "-I" + path.join(prefix, "include"),
    LDFLAGS: "-L" + path.join(prefix, "lib"),
  };
} else if (windows) {
  const prefix = process.env.OPALINE_MINGW_PREFIX ?? "C:/msys64/mingw64";
  dependencyDirectories = [path.join(prefix, "bin")];
  buildEnvironment = {
    ...buildEnvironment,
    MSYSTEM: "MINGW64",
    CHERE_INVOKING: "1",
    PATH:
      path.join(prefix, "bin") +
      path.delimiter +
      path.join(prefix, "../usr/bin") +
      path.delimiter +
      process.env.PATH,
  };
}
const run = async (command, args, cwd) => {
  try {
    const result = await execute(command, args, {
      cwd,
      env: buildEnvironment,
      maxBuffer: 32 * 1024 * 1024,
    });
    await fs.appendFile(
      path.join(cache, "build.log"),
      result.stdout + result.stderr,
    );
    return result;
  } catch (error) {
    await fs.appendFile(
      path.join(cache, "build.log"),
      String(error.stdout ?? "") + String(error.stderr ?? ""),
    );
    throw new Error(
      command +
        " failed. See " +
        path.join(cache, "build.log") +
        "\n" +
        String(error.stderr ?? "").slice(-3000),
    );
  }
};
const packaged = [];
const savedManifest = JSON.parse(
  await fs
    .readFile(path.join(destination, "manifest.json"), "utf8")
    .catch(() => "{}"),
);
const openssl =
  process.platform === "darwin"
    ? path.join(dependencyDirectories[0], "../bin/openssl")
    : "openssl";
const buildIdentity = {
  recipe: 2,
  openssl: (
    await execute(openssl, ["version"], { env: buildEnvironment })
  ).stdout.trim(),
  signingIdentity:
    process.platform === "darwin"
      ? (process.env.OPALINE_CLIENT_SIGNING_IDENTITY ?? "-")
      : null,
};
for (const [version, sha256] of Object.entries(releases)) {
  const major = Number(version.split(".")[0]);
  const current = path.join(destination, String(major));
  const marker = path.join(current, "build.json");
  let previous;
  try {
    previous = JSON.parse(await fs.readFile(marker, "utf8"));
  } catch {
    /* first build */
  }
  if (
    previous?.target === target &&
    previous?.version === version &&
    previous?.sourceSha256 === sha256 &&
    Object.entries(buildIdentity).every(
      ([key, value]) => previous?.[key] === value,
    )
  ) {
    const actual = await inventory(current);
    const saved = savedManifest.releases?.find(
      (release) => release.major === major,
    );
    if (saved && JSON.stringify(saved.files) === JSON.stringify(actual)) {
      packaged.push(saved);
      console.log("PostgreSQL " + version + " already prepared.");
      continue;
    }
    throw new Error(
      "Prepared PostgreSQL files changed; remove only the generated " +
        current +
        " directory, then rebuild.",
    );
  }
  console.log(
    "Preparing bundled PostgreSQL " + version + " for " + target + "…",
  );
  const archive = path.join(cache, "postgresql-" + version + ".tar.bz2");
  try {
    if ((await digest(archive)) !== sha256)
      throw new Error("Cached source checksum mismatch");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const url =
      "https://ftp.postgresql.org/pub/source/v" +
      version +
      "/postgresql-" +
      version +
      ".tar.bz2";
    // Release sources are pinned independently in git, never trusted merely by download location.
    await run(
      "curl",
      [
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-time",
        "180",
        "--max-filesize",
        "67108864",
        "--output",
        archive,
        url,
      ],
      cache,
    );
    if ((await digest(archive)) !== sha256) {
      await fs.unlink(archive);
      throw new Error("Official PostgreSQL source checksum mismatch.");
    }
  }
  const source = path.join(cache, "postgresql-" + version);
  if (!(await fs.stat(path.join(source, "configure")).catch(() => null)))
    await run("tar", ["-xjf", archive, "-C", cache], cache);
  const install = path.join(cache, "install-" + version);
  const configureArgs = [
    "./configure",
    "--prefix=" + posix(install),
    "--without-readline",
    "--without-icu",
    "--with-ssl=openssl",
    "--without-lz4",
    "--without-zstd",
    "--disable-nls",
  ];
  await run(windows ? "bash" : "sh", configureArgs, source);
  await run("make", ["-C", "src/backend", "generated-headers"], source);
  for (const part of [
    "src/interfaces/libpq",
    "src/bin/pg_dump",
    "src/bin/psql",
  ]) {
    await run("make", ["-j" + jobs, "-C", part], source);
    await run("make", ["-C", part, "install"], source);
  }
  const staging = await fs.mkdtemp(
    path.join(destination, ".preparing-" + major + "-"),
  );
  try {
    await bundleClients(
      install,
      staging,
      dependencyDirectories,
      buildEnvironment,
    );
    const notices = path.join(staging, "licenses");
    await fs.mkdir(notices);
    await fs.copyFile(
      path.join(source, "COPYRIGHT"),
      path.join(notices, "PostgreSQL.txt"),
    );
    const opensslNotice =
      process.platform === "darwin"
        ? path.join(dependencyDirectories[0], "../LICENSE.txt")
        : windows
          ? path.join(
              dependencyDirectories[0],
              "../share/licenses/openssl/LICENSE",
            )
          : "/usr/share/doc/libssl3/copyright";
    await fs.copyFile(opensslNotice, path.join(notices, "OpenSSL.txt"));
    if (process.platform === "linux")
      await fs.copyFile(
        "/usr/share/doc/zlib1g/copyright",
        path.join(notices, "zlib.txt"),
      );
    if (windows)
      await fs.cp(
        path.join(dependencyDirectories[0], "../share/licenses"),
        path.join(notices, "toolchain"),
        { recursive: true },
      );
    await fs.writeFile(
      path.join(staging, "build.json"),
      JSON.stringify(
        { target, version, sourceSha256: sha256, ...buildIdentity },
        null,
        2,
      ),
    );
    const files = await inventory(staging);
    // Generated major directories belong to this recipe; do not replace unknown content.
    if (await fs.stat(current).catch(() => null)) {
      if (!previous?.recipe)
        throw new Error("Refusing to replace unknown directory: " + current);
      await fs.rename(
        current,
        path.join(cache, "previous-" + major + "-" + Date.now()),
      );
    }
    await fs.rename(staging, current);
    packaged.push({ major, version, files });
    await fs.writeFile(
      path.join(destination, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          target,
          releases: [
            ...packaged,
            ...(savedManifest.releases ?? []).filter(
              (release) =>
                !packaged.some((done) => done.major === release.major),
            ),
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    // Only this freshly-created staging directory can be removed here.
    await fs.rm(staging, { recursive: true, force: true });
  }
}
await fs.writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify({ version: 1, target, releases: packaged }, null, 2),
);
console.log(
  "Bundled clients ready: " +
    packaged.map((release) => release.version).join(", ") +
    ". No user installation required.",
);
