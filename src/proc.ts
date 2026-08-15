/**
 * Child-process helpers used by the bootstrap orchestrator.
 *
 * Everything goes through `node:child_process` rather than `Deno.Command`:
 * - `windowsHide: true` sets `CREATE_NO_WINDOW` on Windows, so spawning a
 *   console-subsystem binary (node.exe) from this GUI app (which has no
 *   console) doesn't flash a black console window. It's ignored elsewhere.
 * - PATH prepending uses the platform delimiter (`;` on Windows, `:` on unix).
 */
import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import { DELIMITER } from "@std/path";

export interface ProcOptions {
  /** Working directory of the child. */
  cwd?: string;
  /** Extra environment variables; merged over the inherited environment. */
  env?: Record<string, string | undefined>;
  /** Prepend a directory to the child's PATH (platform-correct separator). */
  prependPath?: string;
}

/** Result of running a command to completion. */
export interface RunResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

function spawnOptions(options: ProcOptions): {
  cwd?: string;
  env: Record<string, string | undefined>;
  windowsHide: boolean;
} {
  const env = { ...process.env, ...options.env };
  if (options.prependPath) {
    env.PATH = `${options.prependPath}${DELIMITER}${env.PATH ?? ""}`;
  }
  return { cwd: options.cwd, env, windowsHide: true };
}

/**
 * Spawn a long-running child, draining its stdout/stderr so it never blocks on
 * a full pipe buffer.
 */
export function spawnChild(
  command: string,
  args: string[],
  options: ProcOptions = {},
): ChildProcess {
  const child = spawn(command, args, {
    ...spawnOptions(options),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

/** Run a command to completion and capture its output. */
export function runCommand(
  command: string,
  args: string[],
  options: ProcOptions = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...spawnOptions(options),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outChunks: Uint8Array[] = [];
    const errChunks: Uint8Array[] = [];
    child.stdout?.on("data", (d: Uint8Array) => outChunks.push(d));
    child.stderr?.on("data", (d: Uint8Array) => errChunks.push(d));
    child.on("error", (err) => {
      resolve({ success: false, code: -1, stdout: "", stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        code: code ?? -1,
        stdout: Buffer.concat(outChunks).toString(),
        stderr: Buffer.concat(errChunks).toString(),
      });
    });
  });
}
