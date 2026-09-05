import { execFile as exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export const execute = promisify(exec);
export const digest = async (file) =>
  createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");

const systemWindows =
  /^(api-ms-|ext-ms-|kernel32|user32|advapi32|shell32|ws2_32|secur32|crypt32|bcrypt|ntdll|ole32|oleaut32|gdi32|comdlg32|comctl32|version|winmm|msvcrt|ucrtbase|userenv|normaliz|wldap32|netapi32|dnsapi|iphlpapi|shlwapi)/i;
async function dependencies(file, environment) {
  if (process.platform === "darwin") {
    const { stdout } = await execute("otool", ["-L", file]);
    return stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(" (")[0])
      .filter(
        (name) =>
          name &&
          !name.startsWith("/usr/lib/") &&
          !name.startsWith("/System/Library/"),
      );
  }
  if (process.platform === "win32") {
    const { stdout } = await execute("objdump", ["-p", file], {
      env: environment,
    });
    return [...stdout.matchAll(/DLL Name:\s*(\S+)/g)]
      .map((match) => match[1])
      .filter((name) => !systemWindows.test(name));
  }
  const { stdout } = await execute("ldd", [file]);
  if (stdout.includes("not found"))
    throw new Error("Unresolved client dependency: " + file);
  return stdout.split("\n").flatMap((line) => {
    const match = line.match(/\s*(\S+) => (\/\S+)/);
    if (
      !match ||
      /^(libc\.|libm\.|libpthread\.|libdl\.|librt\.|libresolv\.|libutil\.|ld-linux)/.test(
        match[1],
      )
    )
      return [];
    return [match[2]];
  });
}

// Only the tools and their dependency closure are bundled, not PostgreSQL server binaries.
export async function bundleClients(
  install,
  destination,
  dependencyDirectories,
  environment = process.env,
) {
  const windows = process.platform === "win32";
  const ext = windows ? ".exe" : "";
  const bin = path.join(destination, "bin");
  const lib = windows ? bin : path.join(destination, "lib");
  await fs.mkdir(bin, { recursive: true });
  await fs.mkdir(lib, { recursive: true });
  const copied = new Map();
  const pending = [];
  const locate = async (name, referring) => {
    const guesses = path.isAbsolute(name)
      ? [name]
      : [
          path.join(path.dirname(referring), path.basename(name)),
          path.join(install, "lib", path.basename(name)),
          path.join(install, "bin", path.basename(name)),
          ...dependencyDirectories.map((dir) =>
            path.join(dir, path.basename(name)),
          ),
        ];
    for (const candidate of guesses) {
      try {
        return await fs.realpath(candidate);
      } catch {
        /* try the next build dependency directory */
      }
    }
    throw new Error("Cannot package dependency " + name);
  };
  const copy = async (source, target, executable = false) => {
    if (copied.has(target)) {
      if ((await digest(source)) !== (await digest(copied.get(target).source)))
        throw new Error("Conflicting bundled library: " + target);
      return;
    }
    await fs.copyFile(source, target);
    await fs.chmod(target, 0o755);
    copied.set(target, { source, executable, dependencies: [] });
    pending.push(target);
  };
  for (const name of ["pg_dump", "pg_restore", "psql"])
    await copy(
      path.join(install, "bin", name + ext),
      path.join(bin, name + ext),
      true,
    );
  while (pending.length) {
    const target = pending.shift();
    const record = copied.get(target);
    for (const name of await dependencies(record.source, environment)) {
      const source = await locate(name, record.source);
      const dependency = path.join(lib, path.basename(name));
      if (dependency === target) continue; // Mach-O dylib install-name entry.
      record.dependencies.push({ name, target: dependency });
      await copy(source, dependency);
    }
  }
  for (const [target, record] of copied) {
    if (process.platform === "darwin") {
      if (!record.executable)
        await execute("install_name_tool", [
          "-id",
          "@loader_path/" + path.basename(target),
          target,
        ]);
      for (const dependency of record.dependencies) {
        const relative = path
          .relative(path.dirname(target), dependency.target)
          .split(path.sep)
          .join("/");
        await execute("install_name_tool", [
          "-change",
          dependency.name,
          "@loader_path/" + relative,
          target,
        ]);
      }
      const final = (await execute("otool", ["-L", target])).stdout;
      if (final.includes("/opt/homebrew/") || final.includes(install))
        throw new Error("Non-portable dependency remains: " + target);
      const identity = process.env.OPALINE_CLIENT_SIGNING_IDENTITY ?? "-";
      await execute("codesign", [
        "--force",
        "--sign",
        identity,
        ...(identity === "-" ? [] : ["--options", "runtime", "--timestamp"]),
        target,
      ]);
    } else if (!windows) {
      await execute("patchelf", [
        "--set-rpath",
        record.executable ? "$ORIGIN/../lib" : "$ORIGIN",
        target,
      ]);
    }
  }
  for (const name of ["pg_dump", "pg_restore", "psql"]) {
    const env = windows
      ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR }
      : {};
    await execute(path.join(bin, name + ext), ["--version"], {
      env,
      timeout: 10000,
    });
  }
}

export async function inventory(root, relative = "") {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await inventory(root, name)));
    else if (entry.isFile())
      files.push({ path: name, sha256: await digest(path.join(root, name)) });
    else
      throw new Error("Unexpected symlink or special file in bundle: " + name);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
