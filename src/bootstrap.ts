/**
 * Side-effecting bootstrap orchestrator (thin I/O shell).
 *
 * Responsibilities:
 *  1. Detect installed @deepseek-ai/dsh version.
 *  2. Download + extract a Node LTS binary if missing.
 *  3. Install @deepseek-ai/dsh via @npmcli/arborist (run under Deno) if missing.
 *  4. Spawn dsh on the managed Node, on a chosen port.
 *
 * Pure decision logic lives in the sibling modules (node_version, dsh_package,
 * port, paths) and is unit-tested there. This file wires them to real I/O and
 * is intentionally not unit-tested.
 */
import { dirname, join } from "@std/path";
import { UntarStream } from "@std/tar";
import process from "node:process";
// @ts-types="@types/npmcli__arborist"
import Arborist from "@npmcli/arborist";
import {
  type Arch,
  nodeArchiveExt,
  nodeArchiveName,
  nodeDownloadUrl,
  type NodeIndexEntry,
  type Os,
  resolveLtsVersion,
} from "./node_version.ts";
import { DSH_PACKAGE_NAME, parseInstalledVersion } from "./dsh_package.ts";
import { componentStatus, type VersionsSnapshot } from "./versions.ts";
import { denoPortProbe, pickPort } from "./port.ts";
import {
  binDir,
  cacheDir,
  dshBinPath,
  dshPackageJsonPath,
  nodeBinPath,
  nodeBinSubpath,
  rootDir,
} from "./paths.ts";

const MIRROR_INDEX = "https://cdn.npmmirror.com/binaries/node/index.json";
const NPM_REGISTRY = "https://registry.npmmirror.com/";

export type ProgressEvent =
  | { phase: "detect"; message: string }
  | { phase: "node-download"; message: string; received?: number; total?: number }
  | { phase: "node-extract"; message: string }
  | { phase: "install-resolve"; message: string }
  | { phase: "install-package"; message: string; done: number; total: number | null }
  | { phase: "starting"; message: string; port: number }
  | { phase: "ready"; message: string; url: string }
  | { phase: "error"; message: string };

export type Reporter = (e: ProgressEvent) => void;

/** Current platform mapped to our Os/Arch types. */
export function currentPlatform(): { os: Os; arch: Arch } {
  const os = Deno.build.os === "windows"
    ? "windows"
    : Deno.build.os === "darwin"
    ? "darwin"
    : "linux";
  const arch: Arch = Deno.build.arch === "aarch64" ? "aarch64" : "x86_64";
  return { os, arch };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function detectInstalledDshVersion(): Promise<string | null> {
  let text: string | null = null;
  try {
    text = await Deno.readTextFile(dshPackageJsonPath());
  } catch {
    text = null;
  }
  return parseInstalledVersion(text);
}

/** Run the managed `node --version`; null when Node isn't installed/runnable. */
async function detectInstalledNodeVersion(os: Os): Promise<string | null> {
  if (!(await pathExists(nodeBinPath(os)))) return null;
  try {
    const { success, stdout } = await new Deno.Command(nodeBinPath(os), {
      args: ["--version"],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!success) return null;
    return new TextDecoder().decode(stdout).trim() || null;
  } catch {
    return null;
  }
}

async function fetchNodeIndex(): Promise<NodeIndexEntry[]> {
  const res = await fetch(MIRROR_INDEX);
  if (!res.ok) throw new Error(`failed to fetch Node index: ${res.status}`);
  return await res.json() as NodeIndexEntry[];
}

/** Latest Node LTS for this platform, or null when the index is unreachable. */
async function fetchLatestNodeLts(os: Os, arch: Arch): Promise<string | null> {
  try {
    return resolveLtsVersion(await fetchNodeIndex(), os, arch);
  } catch {
    return null;
  }
}

/** Latest published @deepseek-ai/dsh version, or null when unreachable. */
async function fetchLatestDshVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY}${DSH_PACKAGE_NAME}/latest`);
    if (!res.ok) return null;
    const json = await res.json() as { version?: string };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

/** Download and extract a Node LTS build into binDir(). */
async function installNode(os: Os, arch: Arch, report: Reporter): Promise<void> {
  report({ phase: "node-download", message: "resolving latest Node LTS…" });
  const index = await fetchNodeIndex();
  const version = resolveLtsVersion(index, os, arch);

  const url = nodeDownloadUrl(version, os, arch);
  report({ phase: "node-download", message: `downloading Node ${version}…` });

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Node download failed: ${res.status} ${url}`);
  const total = Number(res.headers.get("content-length")) || undefined;

  await Deno.mkdir(rootDir(), { recursive: true });
  const ext = nodeArchiveExt(os);
  const tmp = await Deno.makeTempFile({ suffix: `.${ext}` });
  {
    const file = await Deno.open(tmp, { write: true, truncate: true });
    let received = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        received += chunk.byteLength;
        report({ phase: "node-download", message: "downloading Node…", received, total });
        ctrl.enqueue(chunk);
      },
    });
    await res.body.pipeThrough(counter).pipeTo(file.writable);
  }

  report({ phase: "node-extract", message: "extracting Node…" });
  const extractRoot = await Deno.makeTempDir();
  await extractArchive(tmp, extractRoot, os);

  // The archive extracts to a single top-level dir: node-<version>-<os>-<arch>/
  const archiveDir = join(extractRoot, nodeArchiveName(version, os, arch));
  const srcBin = join(archiveDir, nodeBinSubpath(os));
  await Deno.mkdir(binDir(), { recursive: true });
  const destBin = nodeBinPath(os);
  await Deno.copyFile(srcBin, destBin);
  if (os !== "windows") await Deno.chmod(destBin, 0o755);

  await Deno.remove(tmp).catch(() => {});
  await Deno.remove(extractRoot, { recursive: true }).catch(() => {});
}

/** Extract a Node archive into destDir: tar.gz on unix, zip on windows. */
async function extractArchive(archivePath: string, destDir: string, os: Os): Promise<void> {
  if (os === "windows") {
    await extractZip(archivePath, destDir);
    return;
  }
  await extractTarGz(archivePath, destDir);
}

async function extractTarGz(tarGzPath: string, destDir: string): Promise<void> {
  const file = await Deno.open(tarGzPath, { read: true });
  const entries = file.readable
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new UntarStream());

  for await (const entry of entries) {
    const outPath = join(destDir, entry.path);
    if (entry.path.endsWith("/") || !entry.readable) {
      await Deno.mkdir(outPath, { recursive: true });
      await entry.readable?.cancel();
      continue;
    }
    await Deno.mkdir(dirname(outPath), { recursive: true });
    const out = await Deno.open(outPath, { write: true, create: true, truncate: true });
    await entry.readable.pipeTo(out.writable);
  }
}

/**
 * Extract a .zip (Windows Node build). Deno has no bundled zip reader, so shell
 * out to the OS `tar` (Windows 10+ ships bsdtar, which reads zip).
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await Deno.mkdir(destDir, { recursive: true });
  const cmd = new Deno.Command("tar", {
    args: ["-xf", zipPath, "-C", destDir],
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success, code } = await cmd.output();
  if (!success) throw new Error(`zip extraction failed (tar exit ${code})`);
}

/**
 * Install @deepseek-ai/dsh via @npmcli/arborist, running under Deno's Node
 * compat layer. Progress is streamed through proc-log events.
 */
async function installDsh(report: Reporter): Promise<void> {
  report({ phase: "install-resolve", message: `resolving ${DSH_PACKAGE_NAME}…` });
  await Deno.mkdir(rootDir(), { recursive: true });
  await Deno.mkdir(cacheDir(), { recursive: true });

  // proc-log emits `time` and `log` events on the global process object;
  // these aren't on the standard node:process type, so narrow to what we use.
  const proc = process as unknown as {
    on(event: "time", listener: (level: string, name: string) => void): void;
    on(event: "log", listener: (level: string, ...args: unknown[]) => void): void;
  };

  const arb = new Arborist({
    path: rootDir(),
    packageLock: false,
    registry: NPM_REGISTRY,
    // Speed: skip the quick-audit registry round-trip (audit === false
    // short-circuits it entirely), persist metadata + tarballs in a cacache
    // dir so they survive across runs, and skip the postinstall build phase.
    audit: false,
    cache: cacheDir(),
    ignoreScripts: true,
  });

  let total: number | null = null;
  let done = 0;

  // proc-log emits deprecation/warning lines during resolution; surface them.
  proc.on("log", (level: string, ...args: unknown[]) => {
    if (level === "warn" && args[0] === "deprecated") {
      report({ phase: "install-resolve", message: `deprecated: ${String(args[1])}` });
    }
  });

  proc.on("time", (level: string, name: string) => {
    if (level !== "start") return;
    if (name.startsWith("idealTree")) {
      report({ phase: "install-resolve", message: `resolving: ${name}` });
    }
    if (name === "reify:unpack" && arb.idealTree) {
      // idealTree is populated by now (it is null again after reify completes);
      // subtract 1 for the root node.
      total = arb.idealTree.inventory.size - 1;
      report({ phase: "install-package", message: `installing ${total} packages…`, done, total });
    }
    if (name.startsWith("reifyNode:")) {
      done++;
      report({
        phase: "install-package",
        message: name.slice("reifyNode:".length),
        done,
        total,
      });
    }
  });

  // arborist 10 expects `add` to be spec strings ("name@version"), NOT
  // { name, spec } objects — npa() runs indexOf on each element as a string.
  await arb.reify({ add: [`${DSH_PACKAGE_NAME}@latest`], save: false });
}

/** Spawn dsh on the managed Node at the chosen port. Returns child + port. */
function spawnDsh(os: Os, port: number): Deno.ChildProcess {
  const cmd = new Deno.Command(nodeBinPath(os), {
    args: [dshBinPath(), "--profile", "web", "--port", String(port)],
    stdout: "inherit",
    stderr: "inherit",
    env: { PATH: `${binDir()}:${Deno.env.get("PATH") ?? ""}` },
  });
  return cmd.spawn();
}

export interface BootstrapResult {
  child: Deno.ChildProcess;
  url: string;
  port: number;
}

/**
 * Full bootstrap: ensure Node + dsh installed, pick a port, spawn dsh, and
 * wait until its HTTP server answers. Returns the child process and URL.
 */
export async function bootstrap(report: Reporter): Promise<BootstrapResult> {
  const { os, arch } = currentPlatform();

  report({ phase: "detect", message: "checking installation…" });
  const installedDsh = await detectInstalledDshVersion();

  if (!(await pathExists(nodeBinPath(os)))) {
    await installNode(os, arch, report);
  }

  if (installedDsh == null) {
    await installDsh(report);
  }

  const port = pickPort(denoPortProbe);
  report({ phase: "starting", message: "starting dsh…", port });
  const child = spawnDsh(os, port);

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  report({ phase: "ready", message: "ready", url });

  return { child, url, port };
}

/**
 * Gather installed + latest versions for Node and dsh, for the versions/upgrade
 * menu. Latest values are null when the network is unreachable.
 */
export async function queryVersions(): Promise<VersionsSnapshot> {
  const { os, arch } = currentPlatform();
  const [nodeInstalled, dshInstalled, nodeLatest, dshLatest] = await Promise.all([
    detectInstalledNodeVersion(os),
    detectInstalledDshVersion(),
    fetchLatestNodeLts(os, arch),
    fetchLatestDshVersion(),
  ]);
  return {
    node: componentStatus(nodeInstalled, nodeLatest),
    dsh: componentStatus(dshInstalled, dshLatest),
  };
}

/** Re-download the latest Node LTS binary (used by the "upgrade" menu item). */
export async function upgradeNode(report: Reporter): Promise<void> {
  const { os, arch } = currentPlatform();
  await installNode(os, arch, report);
}

/** Re-install the latest @deepseek-ai/dsh (used by the "upgrade" menu item). */
export async function upgradeDsh(report: Reporter): Promise<void> {
  await installDsh(report);
}

/** Poll the URL until it responds or the timeout elapses. */
async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      await res.body?.cancel();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`dsh server did not start within ${timeoutMs}ms at ${url}`);
}
