/**
 * DSH desktop app entrypoint.
 *
 * The Deno desktop webview points at this Deno.serve() handler, which shows a
 * bootstrap/progress UI. In the background we ensure Node + @deepseek-ai/dsh
 * are installed, spawn dsh's web server, and once it is ready the UI redirects
 * the webview to the dsh URL.
 */
import { bootstrap, type ProgressEvent } from "./src/bootstrap.ts";
import { createBootstrapHandler } from "./src/ui.ts";
import { type DesktopWindow, setupShell } from "./src/desktop.ts";

type Listener = (e: ProgressEvent, readyUrl?: string) => void;

const listeners = new Set<Listener>();
let lastEvent: ProgressEvent = { phase: "detect", message: "Starting…" };
let readyUrl: string | undefined;
/** URL of the local bootstrap UI; set once Deno.serve is listening. */
let bootstrapUrl: string | undefined;

function emit(e: ProgressEvent, url?: string) {
  lastEvent = e;
  if (url) readyUrl = url;
  for (const fn of listeners) fn(e, url);
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  // Replay the latest event so a late-connecting client is caught up.
  fn(lastEvent, readyUrl);
  return () => listeners.delete(fn);
}

// dsh child process, killed when the app exits.
let child: Deno.ChildProcess | undefined;

function shutdown() {
  try {
    child?.kill("SIGTERM");
  } catch {
    // already gone
  }
}
globalThis.addEventListener("unload", shutdown);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  try {
    Deno.addSignalListener(sig, () => {
      shutdown();
      Deno.exit(0);
    });
  } catch {
    // signal not supported on this platform
  }
}

// Adopt the startup window opened by `deno desktop` (first construction adopts
// it) and give it a title + size.
const win = new Deno.BrowserWindow({
  title: "DeepSeek",
  width: 1200,
  height: 800,
}) as unknown as DesktopWindow;

function navigate(url: string | undefined) {
  if (url) win.loadURL(url);
}

// Wire the application menu, tray, and hide-on-close behavior.
setupShell({
  window: win,
  report: (e) => emit(e),
  showBootstrap: () => {
    // Reset progress state and show the bootstrap page again for upgrades.
    lastEvent = { phase: "detect", message: "Starting…" };
    navigate(bootstrapUrl);
  },
  showApp: () => navigate(readyUrl),
  quit: () => {
    shutdown();
    Deno.exit(0);
  },
});

// Kick off bootstrap in the background.
(async () => {
  try {
    const result = await bootstrap((e) => emit(e));
    child = result.child;
    emit({ phase: "ready", message: "ready", url: result.url }, result.url);
    // If dsh dies, surface it in the UI.
    result.child.status.then((s) => {
      if (!s.success) {
        emit({ phase: "error", message: `dsh exited with code ${s.code}` });
      }
    });
  } catch (err) {
    emit({ phase: "error", message: err instanceof Error ? err.message : String(err) });
  }
})();

const handler = createBootstrapHandler(subscribe);

Deno.serve({
  onListen: ({ hostname, port }) => {
    bootstrapUrl = `http://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${port}`;
  },
}, handler);
