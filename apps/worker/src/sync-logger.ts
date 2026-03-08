export interface SyncLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'progress';
  retailer?: string;
  variant?: string;
  message: string;
  price?: number;
  strategy?: string;
  responseTimeMs?: number;
  retryCount?: number;
  httpStatus?: number;
  blocked?: boolean;
  fallbackUsed?: boolean;
}

export interface SyncProgress {
  running: boolean;
  progress: number;
  currentRetailer: string | null;
  currentVariant: string | null;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  totalListings: number;
  processedListings: number;
  step: string;
  startedAt: string | null;
  currentStep?: string;
  estimatedRemainingMs?: number | null;
}

let logs: SyncLogEntry[] = [];
let running = false;
let syncProgress: SyncProgress = {
  running: false,
  progress: 0,
  currentRetailer: null,
  currentVariant: null,
  successCount: 0,
  failureCount: 0,
  blockedCount: 0,
  totalListings: 0,
  processedListings: 0,
  step: 'idle',
  startedAt: null,
  estimatedRemainingMs: null,
};

export function clearSyncLogs() {
  logs = [];
  running = true;
}

export function addSyncLog(entry: Omit<SyncLogEntry, 'timestamp'>) {
  logs.push({ ...entry, timestamp: new Date().toISOString() });
}

/**
 * Structured log: emits a JSON-like structured console line for every scrape attempt.
 * This is the primary observability signal for the worker.
 */
export function logScrapeAttempt(data: {
  retailer: string;
  variant: string;
  strategy?: string;
  status: 'success' | 'blocked' | 'rate_limited' | 'parse_fail' | 'server_error' | 'network_error' | 'not_found' | 'fallback_success' | 'fallback_fail' | 'skipped';
  httpStatus?: number;
  responseTimeMs?: number;
  price?: number;
  retryCount?: number;
  fallbackSource?: string;
  error?: string;
}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...data,
  });
  console.log(`[scrape] ${line}`);
}

export function finishSyncLogs() {
  running = false;
  syncProgress = { ...syncProgress, running: false, step: 'completed', progress: 100, estimatedRemainingMs: null };
}

export function updateSyncProgress(update: Partial<SyncProgress>) {
  syncProgress = { ...syncProgress, ...update };
  // Auto-calculate estimated remaining time
  if (syncProgress.running && syncProgress.startedAt && syncProgress.processedListings > 0 && syncProgress.totalListings > 0) {
    const elapsed = Date.now() - new Date(syncProgress.startedAt).getTime();
    const rate = syncProgress.processedListings / elapsed;
    const remaining = syncProgress.totalListings - syncProgress.processedListings;
    syncProgress.estimatedRemainingMs = rate > 0 ? Math.round(remaining / rate) : null;
  }
}

export function getSyncProgress(): SyncProgress {
  return { ...syncProgress };
}

export function getSyncLogs(since?: number) {
  const filtered = since != null ? logs.slice(since) : logs;
  return { running, total: logs.length, logs: filtered };
}
