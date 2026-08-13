# dsh-gui

A `deno desktop` wrapper around the `@deepseek-ai/dsh` CLI. Ships as a self-contained per-platform
app bundle (e.g. macOS `.app`) via `deno desktop` (https://docs.deno.com/runtime/desktop/).

## Architecture: two runtimes

- **Bundled Deno** (inside the app bundle) — the desktop shell + installer/bootstrap logic. Renders
  the `dsh` web UI in its webview.
- **Downloaded Node** (`~/dsh-gui/bin/node`) — runs the actual `dsh` server as a subprocess.
  `@deepseek-ai/dsh` is a Node package (native `#!/usr/bin/env node` shebang, full npm dependency
  tree); it must run on real Node, not Deno's Node-compat layer. The app bundle does not expose a
  general-purpose `deno` CLI to run arbitrary scripts, so a real Node is required.

## Bootstrap (on startup)

1. Detect installed `@deepseek-ai/dsh` version by reading
   `~/dsh-gui/node_modules/@deepseek-ai/dsh/package.json`.
2. If Node is missing, download the LTS binary into `~/dsh-gui/bin/node`. Resolve the current LTS
   version _at download time_ (do not pin): read the npmmirror binary index
   (`https://cdn.npmmirror.com/binaries/node/index.json`) and pick the highest version whose `lts`
   field is truthy and that publishes an artifact for the target platform. Select the tarball by
   `Deno.build.os` / `Deno.build.arch`, downloading bytes from the npmmirror binary mirror
   (`https://cdn.npmmirror.com/binaries/node/<version>/`).
3. If `@deepseek-ai/dsh` is missing, install it with `@npmcli/arborist` (run under Deno), using the
   npmmirror registry (`https://registry.npmmirror.com/`) and showing live install progress.

### Arborist install with live progress

```js
const Arborist = require("@npmcli/arborist");
const arb = new Arborist({ path: "/target/dir", packageLock: false });

let total = null, done = 0;

// Phase + per-package progress ('time' fires with level 'start' and 'end')
process.on("time", (level, name) => {
  if (level !== "start") return;
  if (name.startsWith("idealTree")) console.log("resolving:", name);
  if (name === "reify:unpack") {
    // ideal tree is fully resolved by now → we know the package count
    total = arb.idealTree.inventory.size - 1; // minus root
    console.log(`installing ${total} packages...`);
  }
  if (name.startsWith("reifyNode:")) {
    done++;
    console.log(`  [${done}/${total ?? "?"}] ${name.slice("reifyNode:".length)}`);
  }
});

// Warnings, deprecations, pacote fetch/cache lines — proc-log emits everything; filter yourself
process.on("log", (level, ...args) => {
  if (level === "warn" && args[0] === "deprecated") console.warn("deprecated:", args[1]);
});

// NOTE: arborist 10's `add` takes spec STRINGS, not { name, spec } objects.
await arb.reify({ add: ["webpack@^5"], save: false });
```

## Running dsh

After bootstrap, Deno spawns:

```
~/dsh-gui/bin/node ~/dsh-gui/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile web --port <free-port>
```

- **Port selection (done in Deno, then passed explicitly):** try to bind `3080`; if free, pass
  `--port 3080`. If taken, bind an OS-assigned free port, close it, and pass that number explicitly.
  This way Deno always knows the port without parsing `dsh` stdout.
- The `dsh` web server is rendered by the desktop webview.

## Shell integration (menu, tray)

- **Application menu** (`src/desktop.ts`): a "Versions" submenu shows the installed Node and
  DeepSeek versions and offers "Check for Updates" plus per-component "Upgrade" items (enabled only
  when a newer version exists). Upgrades re-run the bootstrap install and show the progress screen,
  then return to the app. Version/upgrade logic is `src/versions.ts` (unit-tested); the actual
  queries/installs reuse `queryVersions` / `upgradeNode` / `upgradeDsh` in `src/bootstrap.ts`.
- **System tray**: Show / Check for Updates / Quit. Closing the window hides it (and hides the dock
  icon) rather than quitting — the app is quit from the tray. The dock `reopen` event reshows the
  window on macOS.
- **Icon**: `assets/icon.png` (DeepSeek favicon), imported as raw bytes (`--unstable-raw-imports`)
  for the tray and as a data URI in the bootstrap UI; packaged per-platform via the
  `desktop.app.icons` config.

## Typechecking note

The desktop APIs (`Deno.BrowserWindow`, `Deno.Tray`, `Deno.dock`, `Deno.MenuItem`) only exist under
the `deno desktop` runtime, not standalone `deno check`. `deno desktop` runs a full typecheck
itself, so `deno task dev` / `deno task build` are the authoritative typecheck — there is no
separate `check` task.

## Notes / open risks

- Upstream install currently fails: `@deepseek-ai/dsh` pins its subpackages at `^0.1.0-rc.6`, but
  those subpackages only publish `0.0.1-rc.1` — which does not satisfy the range. Any install path
  (arborist or otherwise) hits this until upstream is fixed.
- `@deepseek-ai/dsh` bin: `{ "dsh": "lib/bin.js" }`. `dsh web` is an alias for `dsh --profile web`.
  `--port` is parsed by the `@deepseek-ai/dsh-web-app` plugin. No `engines` field declared.
