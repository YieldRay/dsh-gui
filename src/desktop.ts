/**
 * Desktop shell integration: application menu, system tray, and window
 * lifecycle. The app always runs under `deno desktop`, so the runtime APIs
 * (Deno.BrowserWindow, Deno.Tray, Deno.dock, Deno.MenuItem) are available and
 * typed by the desktop runtime at build time.
 */
import { ICON_PNG } from "./assets.ts";
import { menuLabel, type VersionsSnapshot } from "./versions.ts";
import { type ProgressEvent, queryVersions, upgradeDsh, upgradeNode } from "./bootstrap.ts";

/**
 * The subset of the `deno desktop` window API we use. The runtime provides the
 * full type at build time; this describes exactly the methods/events we rely
 * on so the code is precise without depending on internal generic parameters.
 */
export interface DesktopWindow {
  loadURL(url: string): void;
  show(): void;
  hide(): void;
  setTitle(title: string): void;
  setApplicationMenu(menu: Deno.MenuItem[]): void;
  addEventListener(
    type: "menuclick",
    listener: (e: { detail: { id?: string } }) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: (e: { preventDefault(): void }) => void,
  ): void;
}

export interface ShellHooks {
  /** The primary window (the adopted startup window). */
  window: DesktopWindow;
  /** Emit a progress event (reuses the bootstrap SSE transport / UI). */
  report: (e: ProgressEvent) => void;
  /** Navigate the main window back to the bootstrap page during an upgrade. */
  showBootstrap: () => void;
  /** Navigate the main window to the dsh URL (after an upgrade completes). */
  showApp: () => void;
  /** Fully quit (kills the dsh child, then exits). */
  quit: () => void;
}

/**
 * Build the application menu from a versions snapshot. Version rows are
 * informational (disabled); upgrade rows enable only when an upgrade exists.
 */
function buildMenu(v: VersionsSnapshot): Deno.MenuItem[] {
  return [
    {
      submenu: {
        label: "DeepSeek",
        items: [
          { role: { role: "hide" } },
          { role: { role: "quit" } },
        ],
      },
    },
    {
      submenu: {
        label: "Versions",
        items: [
          { item: { label: menuLabel("Node", v.node), enabled: false } },
          { item: { label: menuLabel("DeepSeek", v.dsh), enabled: false } },
          "separator",
          {
            item: {
              label: "Check for Updates…",
              id: "check-updates",
              accelerator: "CmdOrCtrl+U",
              enabled: true,
            },
          },
          {
            item: {
              label: v.node.upgradeAvailable ? "Upgrade Node ●" : "Upgrade Node",
              id: "upgrade-node",
              enabled: v.node.upgradeAvailable,
            },
          },
          {
            item: {
              label: v.dsh.upgradeAvailable ? "Upgrade DeepSeek ●" : "Upgrade DeepSeek",
              id: "upgrade-dsh",
              enabled: v.dsh.upgradeAvailable,
            },
          },
        ],
      },
    },
    {
      submenu: {
        label: "Edit",
        items: [
          { role: { role: "undo" } },
          { role: { role: "redo" } },
          "separator",
          { role: { role: "cut" } },
          { role: { role: "copy" } },
          { role: { role: "paste" } },
          { role: { role: "selectAll" } },
        ],
      },
    },
  ];
}

/** Rebuild + apply the application menu from freshly-queried versions. */
async function refreshMenu(win: DesktopWindow): Promise<void> {
  win.setApplicationMenu(buildMenu(await queryVersions()));
}

/**
 * Run an upgrade: show the bootstrap progress screen, perform the upgrade,
 * refresh the menu, then return to the app.
 */
async function runUpgrade(hooks: ShellHooks, kind: "node" | "dsh"): Promise<void> {
  hooks.showBootstrap();
  try {
    if (kind === "node") await upgradeNode(hooks.report);
    else await upgradeDsh(hooks.report);
    hooks.report({ phase: "ready", message: "upgrade complete", url: "" });
  } catch (err) {
    hooks.report({ phase: "error", message: err instanceof Error ? err.message : String(err) });
  }
  await refreshMenu(hooks.window);
  hooks.showApp();
}

/** Install the application menu, tray, and window-close handling. */
export function setupShell(hooks: ShellHooks): void {
  const win = hooks.window;

  refreshMenu(win).catch(() => {});

  win.addEventListener("menuclick", (e) => {
    switch (e.detail.id) {
      case "check-updates":
        refreshMenu(win).catch(() => {});
        break;
      case "upgrade-node":
        void runUpgrade(hooks, "node");
        break;
      case "upgrade-dsh":
        void runUpgrade(hooks, "dsh");
        break;
    }
  });

  // Closing the window hides it instead of quitting; the app lives in the tray.
  win.addEventListener("close", (e) => {
    e.preventDefault();
    win.hide();
    Deno.dock.setVisible(false);
  });

  setupTray(hooks);

  // macOS: clicking the dock icon with no visible window reopens it.
  Deno.dock.addEventListener("reopen", (e) => {
    if (!e.detail.hasVisibleWindows) win.show();
  });
}

/** System tray — the only place the app is fully quit from. */
function setupTray(hooks: ShellHooks): void {
  const win = hooks.window;
  const tray = new Deno.Tray();
  if (tray.trayId === 0) return; // tray unsupported on this platform/backend
  tray.setIcon(ICON_PNG);
  tray.setTooltip("DeepSeek Harness");
  tray.setMenu([
    { item: { label: "Show DeepSeek", id: "show", enabled: true } },
    { item: { label: "Check for Updates…", id: "check-updates", enabled: true } },
    "separator",
    { item: { label: "Quit", id: "quit", accelerator: "CmdOrCtrl+Q", enabled: true } },
  ]);

  const show = () => {
    Deno.dock.setVisible(true);
    win.show();
  };

  tray.addEventListener("menuclick", (e) => {
    switch (e.detail.id) {
      case "show":
        show();
        break;
      case "check-updates":
        refreshMenu(win).catch(() => {});
        break;
      case "quit":
        hooks.quit();
        break;
    }
  });
  tray.addEventListener("click", show);
}
