import { prisma } from '@repo/shared';

// ─── Worker Config Cache (DB-backed with 5s TTL) ────────────────

export interface WorkerSettings {
  syncIntervalMinMs: number;
  syncIntervalMaxMs: number;
  requestDelayMinMs: number;
  requestDelayMaxMs: number;
  jitterPercent: number;
  globalConcurrency: number;
  providerConcurrency: number;
  maxRetries: number;
  cooldownMultiplier: number;
  blockCooldownMinutes: number;
  activeMode: string;
}

const ENV_DEFAULTS: WorkerSettings = {
  syncIntervalMinMs: parseInt(process.env.SYNC_MIN_MS ?? '60000', 10),
  syncIntervalMaxMs: parseInt(process.env.SYNC_MAX_MS ?? '3600000', 10),
  requestDelayMinMs: 1500,
  requestDelayMaxMs: 3000,
  jitterPercent: 30,
  globalConcurrency: 1,
  providerConcurrency: 1,
  maxRetries: 2,
  cooldownMultiplier: 1.5,
  blockCooldownMinutes: 10,
  activeMode: 'balanced',
};

let configCache: WorkerSettings | null = null;
let configCacheTime = 0;
// 5s TTL: hot-swap propagates within one loop iteration without hammering DB.
// 15 workers × 1 fetch per 5s = 3 queries/sec — negligible.
const CONFIG_CACHE_TTL = parseInt(process.env.WORKER_CONFIG_TTL_MS ?? '5000', 10);

export async function getWorkerConfig(): Promise<WorkerSettings> {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache;
  }

  try {
    const row = await prisma.workerConfig.findUnique({ where: { id: 'default' } });
    if (row) {
      configCache = {
        syncIntervalMinMs: row.syncIntervalMinMs,
        syncIntervalMaxMs: row.syncIntervalMaxMs,
        requestDelayMinMs: row.requestDelayMinMs,
        requestDelayMaxMs: row.requestDelayMaxMs,
        jitterPercent: row.jitterPercent,
        globalConcurrency: row.globalConcurrency,
        providerConcurrency: row.providerConcurrency,
        maxRetries: row.maxRetries,
        cooldownMultiplier: row.cooldownMultiplier,
        blockCooldownMinutes: row.blockCooldownMinutes,
        activeMode: row.activeMode,
      };
      configCacheTime = now;
      return configCache;
    }
  } catch (err) {
    console.warn('[worker-config] DB fetch failed, using env defaults:', err instanceof Error ? err.message : err);
  }

  return ENV_DEFAULTS;
}

/** Force refresh config from DB on next call */
export function invalidateConfigCache(): void {
  configCache = null;
  configCacheTime = 0;
}

// ─── Mode Presets ───────────────────────────────────────────────

export interface ModePreset {
  name: string;
  label: string;
  description: string;
  globalConcurrency: number;
  providerConcurrency: number;
  requestDelayMinMs: number;
  requestDelayMaxMs: number;
  jitterPercent: number;
  maxRetries: number;
  cooldownMultiplier: number;
  blockCooldownMinutes: number;
  syncIntervalMinMs: number;
  syncIntervalMaxMs: number;
}

export const MODE_PRESETS: ModePreset[] = [
  {
    name: 'safe',
    label: 'Güvenli',
    description: 'Yavaş ve güvenli — bloklanma riski minimum',
    globalConcurrency: 1,
    providerConcurrency: 1,
    requestDelayMinMs: 3000,
    requestDelayMaxMs: 6000,
    jitterPercent: 40,
    maxRetries: 1,
    cooldownMultiplier: 2.0,
    blockCooldownMinutes: 15,
    syncIntervalMinMs: 300000,
    syncIntervalMaxMs: 3600000,
  },
  {
    name: 'balanced',
    label: 'Dengeli',
    description: 'Hız ve güvenlik dengesi',
    globalConcurrency: 1,
    providerConcurrency: 1,
    requestDelayMinMs: 1500,
    requestDelayMaxMs: 3000,
    jitterPercent: 30,
    maxRetries: 2,
    cooldownMultiplier: 1.5,
    blockCooldownMinutes: 10,
    syncIntervalMinMs: 60000,
    syncIntervalMaxMs: 3600000,
  },
  {
    name: 'aggressive',
    label: 'Agresif',
    description: 'Hızlı senkronizasyon — orta risk',
    globalConcurrency: 2,
    providerConcurrency: 1,
    requestDelayMinMs: 800,
    requestDelayMaxMs: 1500,
    jitterPercent: 25,
    maxRetries: 2,
    cooldownMultiplier: 1.3,
    blockCooldownMinutes: 5,
    syncIntervalMinMs: 30000,
    syncIntervalMaxMs: 900000,
  },
  {
    name: 'god',
    label: 'God Mode',
    description: 'Maksimum hız — yüksek bloklanma riski!',
    globalConcurrency: 3,
    providerConcurrency: 2,
    requestDelayMinMs: 300,
    requestDelayMaxMs: 800,
    jitterPercent: 20,
    maxRetries: 3,
    cooldownMultiplier: 1.2,
    blockCooldownMinutes: 3,
    syncIntervalMinMs: 15000,
    syncIntervalMaxMs: 300000,
  },
  {
    name: 'auto',
    label: 'Auto (AIMD)',
    description: 'Otonom — AutoTuner sınırı bulana dek üstüne basıyor',
    globalConcurrency: 2,
    providerConcurrency: 1,
    requestDelayMinMs: 1000,
    requestDelayMaxMs: 2000,
    jitterPercent: 25,
    maxRetries: 2,
    cooldownMultiplier: 1.4,
    blockCooldownMinutes: 5,
    syncIntervalMinMs: 30000,
    syncIntervalMaxMs: 600000,
  },
];

export function getModePreset(name: string): ModePreset | undefined {
  return MODE_PRESETS.find(m => m.name === name);
}
