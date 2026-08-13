import { assertEquals } from "@std/assert";
import { renderProgress } from "./progress_view.ts";

Deno.test("node-download computes percentage from received/total", () => {
  const v = renderProgress({
    phase: "node-download",
    message: "downloading Node…",
    received: 50,
    total: 200,
  });
  assertEquals(v.percent, 25);
  assertEquals(v.done, false);
  assertEquals(v.error, false);
});

Deno.test("node-download is indeterminate without total", () => {
  const v = renderProgress({ phase: "node-download", message: "downloading…", received: 50 });
  assertEquals(v.percent, null);
});

Deno.test("install-package formats [done/total] and percentage", () => {
  const v = renderProgress({
    phase: "install-package",
    message: "left-pad",
    done: 3,
    total: 12,
  });
  assertEquals(v.line, "[3/12] left-pad");
  assertEquals(v.percent, 25);
});

Deno.test("install-package with null total is indeterminate", () => {
  const v = renderProgress({ phase: "install-package", message: "x", done: 1, total: null });
  assertEquals(v.percent, null);
  assertEquals(v.line, "x");
});

Deno.test("ready is done at 100%", () => {
  const v = renderProgress({ phase: "ready", message: "ready", url: "http://127.0.0.1:3080" });
  assertEquals(v.done, true);
  assertEquals(v.percent, 100);
});

Deno.test("error sets the error flag", () => {
  const v = renderProgress({ phase: "error", message: "boom" });
  assertEquals(v.error, true);
});

Deno.test("detect / starting are indeterminate, not done", () => {
  assertEquals(renderProgress({ phase: "detect", message: "checking…" }).percent, null);
  assertEquals(
    renderProgress({ phase: "starting", message: "starting…", port: 3080 }).done,
    false,
  );
});
