'use client';

import type { ReactNode, RefObject } from 'react';

interface LogTerminalProps {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  maxHeight?: string;
  isEmpty?: boolean;
  emptyText?: string;
}

export function LogTerminal({
  children,
  scrollRef,
  maxHeight = '320px',
  isEmpty,
  emptyText = 'Henüz log yok...',
}: LogTerminalProps) {
  return (
    <div
      ref={scrollRef}
      className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3 font-mono text-[11px] leading-relaxed overflow-y-auto"
      style={{ maxHeight, contain: 'content' }}
    >
      {isEmpty ? (
        <div className="text-[#8b949e] text-center py-4">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
}
