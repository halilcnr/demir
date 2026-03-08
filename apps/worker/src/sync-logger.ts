export interface SyncLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'progress';
  retailer?: string;
  variant?: string;
  message: string;
  price?: number;
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
};

export function clearSyncLogs() {
  logs = [];
  running = true;
}

export function addSyncLog(entry: Omit<SyncLogEntry, 'timestamp'>) {
  logs.push({ ...entry, timestamp: new Date().toISOString() });
}

export function finishSyncLogs() {
  running = false;
  syncProgress = { ...syncProgress, running: false, step: 'completed', progress: 100 };
}

export function updateSyncProgress(update: Partial<SyncProgress>) {
  syncProgress = { ...syncProgress, ...update };
}

export function getSyncProgress(): SyncProgress {
  return { ...syncProgress };
}

export function getSyncLogs(since?: number) {
  const filtered = since != null ? logs.slice(since) : logs;
  return { running, total: logs.length, logs: filtered };
}
