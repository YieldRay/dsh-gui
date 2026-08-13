/**
 * Pure logic for the version/upgrade panel: given the currently-installed and
 * latest-available versions of Node and @deepseek-ai/dsh, decide what to show
 * and whether an upgrade is available.
 *
 * Fetching the actual versions is I/O and lives in the caller; this module only
 * interprets the strings.
 */
import { compareVersions } from "./node_version.ts";

export interface ComponentStatus {
  /** Installed version, or null when not installed. */
  installed: string | null;
  /** Latest available version, or null when unknown (e.g. offline). */
  latest: string | null;
  /** True when a strictly-newer version is available. */
  upgradeAvailable: boolean;
}

export interface VersionsSnapshot {
  node: ComponentStatus;
  dsh: ComponentStatus;
}

/**
 * Normalize a version string for display: strip a leading "v" so Node ("v22")
 * and dsh ("0.1.0") render consistently. Returns "—" for null.
 */
export function displayVersion(v: string | null): string {
  if (v == null) return "—";
  return v.replace(/^v/, "");
}

/**
 * Compare installed vs latest for one component. `compare` decides ordering;
 * defaults to semver-ish comparison (also handles Node's leading "v").
 * An upgrade is available only when both are known and latest > installed.
 */
export function componentStatus(
  installed: string | null,
  latest: string | null,
  compare: (a: string, b: string) => number = looseCompare,
): ComponentStatus {
  let upgradeAvailable = false;
  if (installed != null && latest != null) {
    try {
      upgradeAvailable = compare(latest, installed) > 0;
    } catch {
      // Unparseable (e.g. prerelease tags we don't model) → be conservative.
      upgradeAvailable = installed !== latest;
    }
  }
  return { installed, latest, upgradeAvailable };
}

/**
 * Comparison that tolerates a leading "v" and falls back to string inequality
 * for versions the strict numeric parser rejects (e.g. "0.1.0-rc.6").
 */
export function looseCompare(a: string, b: string): number {
  try {
    return compareVersions(a, b);
  } catch {
    if (a === b) return 0;
    // Not strictly orderable; treat any difference as "b differs from a".
    return a < b ? -1 : 1;
  }
}

/** A one-line menu label for a component, e.g. "Node: 22.11.0 (update →)". */
export function menuLabel(name: string, status: ComponentStatus): string {
  const cur = displayVersion(status.installed);
  if (status.upgradeAvailable && status.latest) {
    return `${name}: ${cur} → ${displayVersion(status.latest)}`;
  }
  return `${name}: ${cur}`;
}
