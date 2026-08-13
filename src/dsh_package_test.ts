import { assertEquals } from "@std/assert";
import { parseInstalledVersion } from "./dsh_package.ts";

Deno.test("parseInstalledVersion reads version from valid package.json", () => {
  assertEquals(
    parseInstalledVersion(JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.0-rc.6" })),
    "0.1.0-rc.6",
  );
});

Deno.test("parseInstalledVersion returns null when file is absent", () => {
  assertEquals(parseInstalledVersion(null), null);
});

Deno.test("parseInstalledVersion returns null on invalid JSON", () => {
  assertEquals(parseInstalledVersion("{ not json"), null);
});

Deno.test("parseInstalledVersion returns null when version missing or empty", () => {
  assertEquals(parseInstalledVersion(JSON.stringify({ name: "x" })), null);
  assertEquals(parseInstalledVersion(JSON.stringify({ version: "" })), null);
  assertEquals(parseInstalledVersion(JSON.stringify({ version: 123 })), null);
});

Deno.test("parseInstalledVersion returns null for non-object JSON", () => {
  assertEquals(parseInstalledVersion("42"), null);
  assertEquals(parseInstalledVersion("null"), null);
});
