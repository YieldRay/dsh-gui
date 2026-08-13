import { assertEquals } from "@std/assert";
import { nodeBinSubpath } from "./paths.ts";

Deno.test("nodeBinSubpath is bin/node on unix, node.exe on windows", () => {
  assertEquals(nodeBinSubpath("darwin"), "bin/node");
  assertEquals(nodeBinSubpath("linux"), "bin/node");
  assertEquals(nodeBinSubpath("windows"), "node.exe");
});
