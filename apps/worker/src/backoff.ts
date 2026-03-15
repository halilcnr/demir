/**
 * Resilient Interval — setInterval with exponential backoff on failure.
 *
 * Replaces raw `setInterval(() => { fn().catch(() => {}) }, ms)` patterns
 * that cause log spam when the DB is degraded. Instead of retrying at
 * the same frequency on failure, it backs off exponentially.
 *
 * Features:
 * - Built-in overlap prevention (re-entry guard)
 * - Exponential backoff on failure (resets on success)
 * - Error logging with proper severity (console.error)
 * - Configurable max backoff cap
 */

const DEFAULT_MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes max backoff

interface ResilientIntervalOptions {
  /** Maximum backoff duration in ms (default: 5 minutes) */
  maxBackoffMs?: number;
  /** Initial backoff in ms on first failure (default: 5000) */
  initialBackoffMs?: number;
  /** Backoff multiplier (default: 3) */
  multiplier?: number;
  /** Whether to log errors (default: true) */
  logErrors?: boolean;
}

interface ResilientIntervalHandle {
  /** Stop the interval */
  stop: () => void;
  /** Whether the task is currently running */
  isRunning: () => boolean;
}

/**
 * Create a resilient periodic task that backs off on failure.
 *
 * @param name - Human-readable name for logging (e.g., "metrics-persist")
 * @param fn - Async function to execute periodically
 * @param intervalMs - Normal interval between runs (when healthy)
 * @param options - Backoff configuration
 * @returns Handle with stop() method
 *
 * @example
 * ```ts
 * const handle = createResilientInterval(
 *   'metrics-persist',
 *   () => persistMetricsToDB(),
 *   60_000, // every 60s when healthy
 * );
 * // Later: handle.stop();
 * ```
 */
export function createResilientInterval(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number,
  options: ResilientIntervalOptions = {},
): ResilientIntervalHandle {
  const {
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    initialBackoffMs = 5_000,
    multiplier = 3,
    logErrors = true,
  } = options;

  let running = false;
  let consecutiveFailures = 0;
  let currentDelay = intervalMs;
  let timer: ReturnType<typeof setTimeout>;

  function schedule() {
    timer = setTimeout(async () => {
      if (running) {
        // Previous invocation still running — skip this tick
        schedule();
        return;
      }

      running = true;
      try {
        await fn();
        // Success — reset backoff
        if (consecutiveFailures > 0) {
          console.log(`[resilient] ${name}: recovered after ${consecutiveFailures} failures, resuming normal interval`);
        }
        consecutiveFailures = 0;
        currentDelay = intervalMs;
      } catch (err) {
        consecutiveFailures++;
        // Calculate backoff: initialBackoff * multiplier^(failures-1), capped at max
        currentDelay = Math.min(
          initialBackoffMs * Math.pow(multiplier, consecutiveFailures - 1),
          maxBackoffMs,
        );

        if (logErrors) {
          console.error(
            `[resilient] ${name}: failure #${consecutiveFailures}, backing off ${Math.round(currentDelay / 1000)}s — ${err instanceof Error ? err.message : err}`,
          );
        }
      } finally {
        running = false;
        schedule(); // Schedule next run with potentially adjusted delay
      }
    }, currentDelay);
  }

  // Start the first tick
  schedule();

  return {
    stop: () => clearTimeout(timer),
    isRunning: () => running,
  };
}
