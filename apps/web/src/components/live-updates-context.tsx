'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface LiveUpdatesContextValue {
  /** Master switch — when false, all polling is disabled */
  enabled: boolean;
  toggle: () => void;
  /** Returns the interval if live updates enabled, otherwise false */
  interval: (ms: number) => number | false;
  /** Conditional interval: returns ms1 when condition true, ms2 when false, or false if live disabled */
  conditionalInterval: (condition: boolean, activeMs: number, idleMs: number | false) => number | false;
}

const LiveUpdatesContext = createContext<LiveUpdatesContextValue>({
  enabled: true,
  toggle: () => {},
  interval: (ms) => ms,
  conditionalInterval: (_c, activeMs) => activeMs,
});

const STORAGE_KEY = 'bakiphone-live-updates';

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'false') setEnabled(false);
    } catch { /* SSR or private browsing */ }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
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

  return (
    <LiveUpdatesContext.Provider value={{ enabled, toggle, interval, conditionalInterval }}>
      {children}
    </LiveUpdatesContext.Provider>
  );
}

export function useLiveUpdates() {
  return useContext(LiveUpdatesContext);
}
