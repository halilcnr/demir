/**
 * Graceful shutdown signal broker.
 *
 * Railway sends SIGTERM and grants ~30s before SIGKILL. We need to:
 *   1. Stop claiming new tasks (task-worker checks isShuttingDown() in its loop)
 *   2. Wait for in-flight tasks to finish (up to 25s)
 *   3. Release any tasks still locked to this worker so peers can pick them up
 *   4. Release distributed locks, stop heartbeats, exit
 *
 * A hard timeout (28s) guarantees the process exits before SIGKILL.
 */

let shuttingDown = false;
const waiters: Array<() => void> = [];

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function signalShutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const cb of waiters) {
    try { cb(); } catch { /* swallow */ }
  }
  waiters.length = 0;
}

/** Register a callback that fires exactly once when shutdown begins. */
export function onShutdown(cb: () => void): void {
  if (shuttingDown) {
    cb();
    return;
  }
  waiters.push(cb);
}

/** Sleep-with-shutdown-abort — resolves immediately if shutdown signals. */
export function sleepOrShutdown(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (shuttingDown) return resolve();
    const timer = setTimeout(resolve, ms);
    onShutdown(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
