/**
 * Pure logic for interpreting the installed `@deepseek-ai/dsh` package.json.
 * The caller reads the file text; this module parses it.
 */

/** The npm package this app wraps. */
export const DSH_PACKAGE_NAME = "@deepseek-ai/dsh";

/**
 * Extract the installed version from a package.json text.
 * Returns null when the file is absent (text === null), unparseable, or has
 * no version — all of which mean "treat as not installed / needs install".
 */
export function parseInstalledVersion(text: string | null): string | null {
  if (text == null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const version = (json as Record<string, unknown>).version;
  return typeof version === "string" && version.length > 0 ? version : null;
}
