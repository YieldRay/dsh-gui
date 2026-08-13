/**
 * Port selection: prefer 3080, otherwise let the OS assign a free port.
 *
 * The binding logic is injected as a `PortProbe` so the decision logic is
 * pure and testable; the real probe (`denoPortProbe`) uses `Deno.listen`.
 */

export const PREFERRED_PORT = 3080;

export interface PortProbe {
  /** Try to bind `port`; return true if it was free (and released again). */
  tryBind(port: number): boolean;
  /** Bind port 0 and return the OS-assigned free port (then release it). */
  findFree(): number;
}

/**
 * Decide which port to hand to `dsh`.
 * Returns PREFERRED_PORT if free, otherwise an OS-assigned free port.
 */
export function pickPort(probe: PortProbe, preferred: number = PREFERRED_PORT): number {
  if (probe.tryBind(preferred)) return preferred;
  return probe.findFree();
}

/** Real probe backed by Deno.listen. Binds then immediately closes. */
export const denoPortProbe: PortProbe = {
  tryBind(port: number): boolean {
    try {
      const l = Deno.listen({ port, hostname: "127.0.0.1" });
      l.close();
      return true;
    } catch {
      return false;
    }
  },
  findFree(): number {
    const l = Deno.listen({ port: 0, hostname: "127.0.0.1" });
    const { port } = l.addr as Deno.NetAddr;
    l.close();
    return port;
  },
};
