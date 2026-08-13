import { assertEquals } from "@std/assert";
import { denoPortProbe, pickPort, type PortProbe, PREFERRED_PORT } from "./port.ts";

Deno.test("pickPort returns preferred port when it is free", () => {
  const probe: PortProbe = {
    tryBind: (p) => p === PREFERRED_PORT,
    findFree: () => 55555,
  };
  assertEquals(pickPort(probe), PREFERRED_PORT);
});

Deno.test("pickPort falls back to OS-assigned port when preferred is taken", () => {
  const probe: PortProbe = {
    tryBind: () => false,
    findFree: () => 49152,
  };
  assertEquals(pickPort(probe), 49152);
});

Deno.test("pickPort honors a custom preferred port", () => {
  const seen: number[] = [];
  const probe: PortProbe = {
    tryBind: (p) => {
      seen.push(p);
      return true;
    },
    findFree: () => 0,
  };
  assertEquals(pickPort(probe, 8080), 8080);
  assertEquals(seen, [8080]);
});

Deno.test("denoPortProbe.findFree returns a real bindable port", () => {
  const port = denoPortProbe.findFree();
  assertEquals(port > 0, true);
  // Confirm it's actually free now (probe released it).
  assertEquals(denoPortProbe.tryBind(port), true);
});
