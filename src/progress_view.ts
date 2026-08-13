/**
 * Pure rendering of a ProgressEvent into what the bootstrap UI shows:
 * a status line and an optional 0..100 percentage (null = indeterminate).
 */
import type { ProgressEvent } from "./bootstrap.ts";

export interface ProgressView {
  line: string;
  percent: number | null;
  done: boolean;
  error: boolean;
}

export function renderProgress(e: ProgressEvent): ProgressView {
  switch (e.phase) {
    case "node-download": {
      let percent: number | null = null;
      if (e.received != null && e.total != null && e.total > 0) {
        percent = Math.min(100, Math.round((e.received / e.total) * 100));
      }
      return { line: e.message, percent, done: false, error: false };
    }
    case "install-package": {
      const percent = e.total && e.total > 0
        ? Math.min(100, Math.round((e.done / e.total) * 100))
        : null;
      const line = e.total ? `[${e.done}/${e.total}] ${e.message}` : e.message;
      return { line, percent, done: false, error: false };
    }
    case "ready":
      return { line: e.message, percent: 100, done: true, error: false };
    case "error":
      return { line: e.message, percent: null, done: false, error: true };
    default:
      return { line: e.message, percent: null, done: false, error: false };
  }
}
