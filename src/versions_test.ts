import { assertEquals } from "@std/assert";
import { componentStatus, displayVersion, looseCompare, menuLabel } from "./versions.ts";

Deno.test("displayVersion strips leading v and handles null", () => {
  assertEquals(displayVersion("v22.11.0"), "22.11.0");
  assertEquals(displayVersion("0.1.0-rc.6"), "0.1.0-rc.6");
  assertEquals(displayVersion(null), "—");
});

Deno.test("looseCompare orders semver and tolerates leading v", () => {
  assertEquals(looseCompare("v22.11.0", "v20.0.0") > 0, true);
  assertEquals(looseCompare("22.11.0", "22.11.0"), 0);
});

Deno.test("looseCompare falls back to string compare for prerelease tags", () => {
  assertEquals(looseCompare("0.1.0-rc.6", "0.1.0-rc.6"), 0);
  assertEquals(looseCompare("0.1.0-rc.6", "0.1.0-rc.5") !== 0, true);
});

Deno.test("componentStatus flags an available upgrade", () => {
  const s = componentStatus("v22.9.0", "v22.11.0");
  assertEquals(s.upgradeAvailable, true);
  assertEquals(s.installed, "v22.9.0");
  assertEquals(s.latest, "v22.11.0");
});

Deno.test("componentStatus: no upgrade when installed is latest", () => {
  assertEquals(componentStatus("v22.11.0", "v22.11.0").upgradeAvailable, false);
});

Deno.test("componentStatus: no upgrade when installed is newer than latest", () => {
  assertEquals(componentStatus("v22.12.0", "v22.11.0").upgradeAvailable, false);
});

Deno.test("componentStatus: no upgrade when either side unknown", () => {
  assertEquals(componentStatus(null, "v22.11.0").upgradeAvailable, false);
  assertEquals(componentStatus("v22.11.0", null).upgradeAvailable, false);
  assertEquals(componentStatus(null, null).upgradeAvailable, false);
});

Deno.test("componentStatus: unparseable prerelease difference counts as upgrade", () => {
  const s = componentStatus("0.1.0-rc.5", "0.1.0-rc.6");
  assertEquals(s.upgradeAvailable, true);
});

Deno.test("menuLabel shows current version, and arrow when upgradable", () => {
  assertEquals(
    menuLabel("Node", componentStatus("v22.9.0", "v22.11.0")),
    "Node: 22.9.0 → 22.11.0",
  );
  assertEquals(
    menuLabel("Node", componentStatus("v22.11.0", "v22.11.0")),
    "Node: 22.11.0",
  );
  assertEquals(
    menuLabel("DeepSeek", componentStatus(null, null)),
    "DeepSeek: —",
  );
});
