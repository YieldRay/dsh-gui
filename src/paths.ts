/**
 * Filesystem layout for the app, all under `~/dsh-gui/`.
 */
import { join } from "@std/path";
import type { Os } from "./node_version.ts";
import { DSH_PACKAGE_NAME } from "./dsh_package.ts";

const [DSH_SCOPE, DSH_NAME] = DSH_PACKAGE_NAME.split("/");

export function homeDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!home) throw new Error("could not determine home directory");
  return home;
}

export function rootDir(): string {
  return join(homeDir(), "dsh-gui");
}

export function binDir(): string {
  return join(rootDir(), "bin");
}

export function nodeModulesDir(): string {
  return join(rootDir(), "node_modules");
}

/**
 * Persistent cacache directory for npm metadata + tarballs. Sharing this across
 * installs lets arborist/pacote reuse fetched packfiles and manifests, which is
 * most of the wall-clock cost on a large tree.
 */
export function cacheDir(): string {
  return join(rootDir(), ".cache");
}

/**
 * Path, relative to an extracted Node archive root, to the `node` executable.
 * Pure so it can be unit-tested per platform.
 * - unix: `bin/node`
 * - windows: `node.exe` (at archive root)
 */
export function nodeBinSubpath(os: Os): string {
  return os === "windows" ? "node.exe" : join("bin", "node");
}

/** Installed absolute path of the node binary we manage. */
export function nodeBinPath(os: Os): string {
  return join(binDir(), os === "windows" ? "node.exe" : "node");
}

/** Path to the installed dsh package.json (for version detection). */
export function dshPackageJsonPath(): string {
  return join(nodeModulesDir(), DSH_SCOPE, DSH_NAME, "package.json");
}

/** Path to the dsh CLI entrypoint we spawn with node. */
export function dshBinPath(): string {
  return join(nodeModulesDir(), DSH_SCOPE, DSH_NAME, "lib", "bin.js");
}
