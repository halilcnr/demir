'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface LiveUpdatesContextValue {
  /** Master switch — when false, all polling is disabled */
  enabled: boolean;
  toggle: () => void;
  /** Track B: operational logs silent mode */
  logsSilent: boolean;
  toggleLogsSilent: () => void;
  /** Returns the interval if live updates enabled, otherwise false */
  interval: (ms: number) => number | false;
  /** Conditional interval: returns ms1 when condition true, ms2 when false, or false if live disabled */
  conditionalInterval: (condition: boolean, activeMs: number, idleMs: number | false) => number | false;
  /** Log-specific interval: returns ms only if master enabled AND logs not silent */
  logInterval: (ms: number) => number | false;
  /** Log-specific conditional interval */
  conditionalLogInterval: (condition: boolean, activeMs: number, idleMs: number | false) => number | false;
}

const LiveUpdatesContext = createContext<LiveUpdatesContextValue>({
  enabled: true,
  toggle: () => {},
  logsSilent: false,
  toggleLogsSilent: () => {},
  interval: (ms) => ms,
  conditionalInterval: (_c, activeMs) => activeMs,
  logInterval: (ms) => ms,
  conditionalLogInterval: (_c, activeMs) => activeMs,
});

const STORAGE_KEY = 'bakiphone-live-updates';
const LOGS_SILENT_KEY = 'bakiphone-logs-silent';

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [logsSilent, setLogsSilent] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'false') setEnabled(false);
      const silentStored = localStorage.getItem(LOGS_SILENT_KEY);
      if (silentStored === 'true') setLogsSilent(true);
    } catch { /* SSR or private browsing */ }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const toggleLogsSilent = useCallback(() => {
    setLogsSilent((prev) => {
      const next = !prev;
      try { localStorage.setItem(LOGS_SILENT_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const interval = useCallback(
    (ms: number): number | false => (enabled ? ms : false),
    [enabled]
  );

  const conditionalInterval = useCallback(
    (condition: boolean, activeMs: number, idleMs: number | false): number | false => {
      if (!enabled) return false;
      return condition ? activeMs : idleMs;
    },
    [enabled]
  );

  const logInterval = useCallback(
    (ms: number): number | false => (enabled && !logsSilent ? ms : false),
    [enabled, logsSilent]
  );

  const conditionalLogInterval = useCallback(
    (condition: boolean, activeMs: number, idleMs: number | false): number | false => {
      if (!enabled || logsSilent) return false;
      return condition ? activeMs : idleMs;
    },
    [enabled, logsSilent]
  );

  return (
    <LiveUpdatesContext.Provider value={{ enabled, toggle, logsSilent, toggleLogsSilent, interval, conditionalInterval, logInterval, conditionalLogInterval }}>
      {children}
    </LiveUpdatesContext.Provider>
  );
}

export function useLiveUpdates() {
  return useContext(LiveUpdatesContext);
}
