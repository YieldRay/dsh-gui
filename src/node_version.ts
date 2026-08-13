/**
 * Pure logic for selecting a Node.js version and building download URLs
 * from the npmmirror binary mirror's `binaries/node/index.json`.
 *
 * No I/O lives here — the caller fetches the index and passes it in.
 */

export interface NodeIndexEntry {
  version: string; // e.g. "v22.11.0"
  files: string[]; // e.g. ["osx-arm64-tar", "linux-x64", ...]
  lts: string | false; // codename when LTS, false otherwise
}

/** Parse a "vMAJOR.MINOR.PATCH" string into a comparable tuple. */
export function parseVersion(version: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) throw new Error(`unrecognized Node version string: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Compare two version strings. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export type Os = "darwin" | "linux" | "windows";
export type Arch = "aarch64" | "x86_64";

/** Node's arch token: arm64 for aarch64, x64 for x86_64. */
export function archToken(arch: Arch): string {
  return arch === "aarch64" ? "arm64" : "x64";
}

/**
 * The index `files` token for a platform, e.g. "osx-arm64", "linux-x64",
 * "win-x64". Used to confirm a given LTS build publishes an artifact for the
 * target platform (the `files` array in each index entry).
 */
export function indexFileToken(os: Os, arch: Arch): string {
  const a = archToken(arch);
  const osPart = os === "darwin" ? "osx" : os === "linux" ? "linux" : "win";
  return `${osPart}-${a}`;
}

/** Whether an index entry publishes a usable artifact for the platform. */
function hasPlatformArtifact(entry: NodeIndexEntry, os: Os, arch: Arch): boolean {
  const token = indexFileToken(os, arch);
  // macOS tar builds are listed as "osx-<arch>-tar"; others match the bare token.
  return entry.files.some((f) => f === token || f.startsWith(`${token}-`));
}

/**
 * Pick the highest LTS version from the mirror index that also publishes an
 * artifact for the target platform. Throws if none qualifies.
 */
export function resolveLtsVersion(index: NodeIndexEntry[], os: Os, arch: Arch): string {
  const lts = index.filter((e) =>
    e.lts !== false && e.lts != null && hasPlatformArtifact(e, os, arch)
  );
  if (lts.length === 0) {
    throw new Error(`no LTS Node build found for ${indexFileToken(os, arch)}`);
  }
  return lts.reduce((best, e) => compareVersions(e.version, best.version) > 0 ? e : best).version;
}

/**
 * Build the archive basename (without extension) for a version+platform,
 * e.g. "node-v22.11.0-darwin-arm64". Note: Node's archive uses
 * "darwin"/"linux"/"win" tokens, distinct from the index `files` tokens.
 */
export function nodeArchiveName(version: string, os: Os, arch: Arch): string {
  const osPart = os === "darwin" ? "darwin" : os === "linux" ? "linux" : "win";
  return `node-${version}-${osPart}-${archToken(arch)}`;
}

/** Extension for the platform archive: tar.gz for unix, zip for windows. */
export function nodeArchiveExt(os: Os): string {
  return os === "windows" ? "zip" : "tar.gz";
}

const MIRROR_BASE = "https://cdn.npmmirror.com/binaries/node";

/** Full download URL for the Node archive on the npmmirror binary mirror. */
export function nodeDownloadUrl(version: string, os: Os, arch: Arch): string {
  const name = nodeArchiveName(version, os, arch);
  const ext = nodeArchiveExt(os);
  return `${MIRROR_BASE}/${version}/${name}.${ext}`;
}
