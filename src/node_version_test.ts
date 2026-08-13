import { assertEquals, assertThrows } from "@std/assert";
import {
  type Arch,
  archToken,
  compareVersions,
  indexFileToken,
  nodeArchiveExt,
  nodeArchiveName,
  nodeDownloadUrl,
  type NodeIndexEntry,
  type Os,
  parseVersion,
  resolveLtsVersion,
} from "./node_version.ts";

const FILES = ["osx-arm64-tar", "osx-x64-tar", "linux-arm64", "linux-x64", "win-x64-zip"];

Deno.test("parseVersion parses with and without leading v", () => {
  assertEquals(parseVersion("v22.11.0"), [22, 11, 0]);
  assertEquals(parseVersion("18.20.4"), [18, 20, 4]);
});

Deno.test("parseVersion rejects garbage", () => {
  assertThrows(() => parseVersion("not-a-version"));
  assertThrows(() => parseVersion("v22.11"));
});

Deno.test("compareVersions orders by major, minor, patch", () => {
  assertEquals(compareVersions("v22.0.0", "v20.0.0") > 0, true);
  assertEquals(compareVersions("v20.10.0", "v20.9.0") > 0, true);
  assertEquals(compareVersions("v20.9.1", "v20.9.0") > 0, true);
  assertEquals(compareVersions("v20.9.0", "v20.9.0"), 0);
});

Deno.test("resolveLtsVersion picks highest LTS, ignoring non-LTS", () => {
  const index: NodeIndexEntry[] = [
    { version: "v24.1.0", files: FILES, lts: false }, // newest but not LTS
    { version: "v22.11.0", files: FILES, lts: "Jod" },
    { version: "v22.9.0", files: FILES, lts: "Jod" },
    { version: "v20.18.0", files: FILES, lts: "Iron" },
  ];
  assertEquals(resolveLtsVersion(index, "darwin", "aarch64"), "v22.11.0");
});

Deno.test("resolveLtsVersion skips LTS builds missing the target artifact", () => {
  const index: NodeIndexEntry[] = [
    // Newest LTS but no arm64 mac build published.
    { version: "v22.11.0", files: ["osx-x64-tar", "linux-x64"], lts: "Jod" },
    // Older LTS that does publish osx-arm64.
    { version: "v20.18.0", files: ["osx-arm64-tar", "linux-x64"], lts: "Iron" },
  ];
  assertEquals(resolveLtsVersion(index, "darwin", "aarch64"), "v20.18.0");
});

Deno.test("resolveLtsVersion throws when no LTS present", () => {
  const index: NodeIndexEntry[] = [
    { version: "v24.1.0", files: FILES, lts: false },
  ];
  assertThrows(() => resolveLtsVersion(index, "linux", "x86_64"));
});

Deno.test("resolveLtsVersion throws when no LTS build for the platform", () => {
  const index: NodeIndexEntry[] = [
    { version: "v22.11.0", files: ["linux-x64"], lts: "Jod" },
  ];
  assertThrows(() => resolveLtsVersion(index, "darwin", "aarch64"));
});

Deno.test("archToken maps arch to node token", () => {
  assertEquals(archToken("aarch64"), "arm64");
  assertEquals(archToken("x86_64"), "x64");
});

Deno.test("indexFileToken maps deno os/arch to index tokens", () => {
  const cases: [Os, Arch, string][] = [
    ["darwin", "aarch64", "osx-arm64"],
    ["darwin", "x86_64", "osx-x64"],
    ["linux", "aarch64", "linux-arm64"],
    ["linux", "x86_64", "linux-x64"],
    ["windows", "x86_64", "win-x64"],
  ];
  for (const [os, arch, expected] of cases) {
    assertEquals(indexFileToken(os, arch), expected);
  }
});

Deno.test("nodeArchiveName uses darwin/linux/win tokens", () => {
  assertEquals(nodeArchiveName("v22.11.0", "darwin", "aarch64"), "node-v22.11.0-darwin-arm64");
  assertEquals(nodeArchiveName("v22.11.0", "linux", "x86_64"), "node-v22.11.0-linux-x64");
  assertEquals(nodeArchiveName("v22.11.0", "windows", "x86_64"), "node-v22.11.0-win-x64");
});

Deno.test("nodeArchiveExt is zip on windows, tar.gz otherwise", () => {
  assertEquals(nodeArchiveExt("windows"), "zip");
  assertEquals(nodeArchiveExt("darwin"), "tar.gz");
  assertEquals(nodeArchiveExt("linux"), "tar.gz");
});

Deno.test("nodeDownloadUrl builds npmmirror binary path", () => {
  assertEquals(
    nodeDownloadUrl("v22.11.0", "darwin", "aarch64"),
    "https://cdn.npmmirror.com/binaries/node/v22.11.0/node-v22.11.0-darwin-arm64.tar.gz",
  );
  assertEquals(
    nodeDownloadUrl("v22.11.0", "windows", "x86_64"),
    "https://cdn.npmmirror.com/binaries/node/v22.11.0/node-v22.11.0-win-x64.zip",
  );
});
