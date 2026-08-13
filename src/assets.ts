/**
 * Static assets bundled into the binary.
 *
 * The icon is imported as raw bytes (needs `--unstable-raw-imports`, set in
 * deno.json). We expose both the raw bytes (for the tray, which wants a
 * Uint8Array) and a data URI (for the bootstrap HTML page).
 */
import { encodeBase64 } from "@std/encoding/base64";
import iconBytes from "../assets/icon.png" with { type: "bytes" };

export const ICON_PNG: Uint8Array = iconBytes;

export const ICON_DATA_URI = `data:image/png;base64,${encodeBase64(iconBytes)}`;
