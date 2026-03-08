export interface SyncLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'progress';
  retailer?: string;
  variant?: string;
  message: string;
  price?: number;
}

let logs: SyncLogEntry[] = [];
let running = false;

export function clearSyncLogs() {
  logs = [];
  running = true;
}

export function addSyncLog(entry: Omit<SyncLogEntry, 'timestamp'>) {
  logs.push({ ...entry, timestamp: new Date().toISOString() });
}

export function finishSyncLogs() {
  running = false;
}

export function getSyncLogs(since?: number) {
  const filtered = since != null ? logs.slice(since) : logs;
  return { running, total: logs.length, logs: filtered };
}
