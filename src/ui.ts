/**
 * The bootstrap UI served by Deno.serve() while Node + dsh are being
 * installed/started. Once dsh is ready, the client redirects the webview to
 * the dsh server URL. This is the whole reason the Deno desktop layer exists.
 */
import type { ProgressEvent } from "./bootstrap.ts";
import { renderProgress } from "./progress_view.ts";
import { ICON_DATA_URI } from "./assets.ts";

const BRAND = "#4D6BFE";

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DeepSeek</title>
<style>
  :root {
    color-scheme: light dark;
    --brand: ${BRAND};
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #8b8b8b;
    --track: #ececf1;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1c1c1f; --fg: #ececec; --muted: #9a9a9a; --track: #2e2e33; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg); color: var(--fg);
    display: grid; place-items: center;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { width: min(360px, 82vw); text-align: center; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 40px; }
  .brand img { width: 40px; height: 40px; border-radius: 9px; }
  .brand .name { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
  .brand .name b { color: var(--brand); font-weight: 700; }
  .bar { height: 4px; border-radius: 999px; background: var(--track); overflow: hidden; }
  .bar > i {
    display: block; height: 100%; width: 0;
    background: var(--brand); border-radius: 999px;
    transition: width .25s ease;
  }
  .bar.indet > i {
    width: 35%;
    animation: slide 1.15s cubic-bezier(.4,0,.2,1) infinite;
  }
  @keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
  #line {
    margin-top: 16px; font-size: 13px; color: var(--muted);
    min-height: 1.4em; font-variant-numeric: tabular-nums;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #line.error { color: #e5484d; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <img src="${ICON_DATA_URI}" alt="" />
      <span class="name">deep<b>seek</b></span>
    </div>
    <div class="bar indet" id="bar"><i id="fill"></i></div>
    <div id="line">Starting…</div>
  </div>
<script>
  const bar = document.getElementById("bar");
  const fill = document.getElementById("fill");
  const line = document.getElementById("line");
  const es = new EventSource("/progress");
  es.onmessage = (ev) => {
    const v = JSON.parse(ev.data);
    line.textContent = v.line;
    line.classList.toggle("error", !!v.error);
    if (v.percent == null) {
      bar.classList.add("indet");
    } else {
      bar.classList.remove("indet");
      fill.style.width = v.percent + "%";
    }
    if (v.done && v.url) {
      es.close();
      location.replace(v.url);
    }
  };
</script>
</body>
</html>`;

/**
 * Build the request handler for the bootstrap UI.
 * `subscribe` registers an SSE listener and returns an unsubscribe fn.
 */
export function createBootstrapHandler(
  subscribe: (fn: (e: ProgressEvent, url?: string) => void) => () => void,
): (req: Request) => Response {
  return (req: Request): Response => {
    const url = new URL(req.url);
    if (url.pathname === "/progress") {
      let unsub = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          unsub = subscribe((e, readyUrl) => {
            const view = { ...renderProgress(e), url: readyUrl };
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify(view)}\n\n`));
            } catch {
              // stream already closed
            }
          });
        },
        cancel() {
          unsub();
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        },
      });
    }
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  };
}
