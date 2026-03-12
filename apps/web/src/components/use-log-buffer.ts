'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseLogBufferOptions {
  maxItems?: number;
  throttleMs?: number;
}

export function useLogBuffer<T>(
  rawItems: T[],
  { maxItems = 200, throttleMs = 250 }: UseLogBufferOptions = {}
) {
  const [items, setItems] = useState<T[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track scroll position for smart auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  // Throttled state updates with memory guard
  useEffect(() => {
    if (rawItems.length === 0 && items.length > 0) {
      setItems([]);
      return;
    }
    if (rawItems.length === 0) return;

    const flush = () => {
      const capped = rawItems.slice(-maxItems);
      setItems(capped);
      lastUpdateRef.current = Date.now();

      if (autoScrollRef.current) {
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    };

    const elapsed = Date.now() - lastUpdateRef.current;
    if (elapsed >= throttleMs) {
      flush();
    } else {
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(flush, throttleMs - elapsed);
    }

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [rawItems, maxItems, throttleMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => setItems([]), []);

  return { items, scrollRef, isAutoScroll: autoScrollRef.current, clear };
}
