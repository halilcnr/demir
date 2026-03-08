import { cn } from '@repo/shared';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const variantStyles = {
  default: 'bg-slate-100 text-slate-600 border-slate-200/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/60',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/60',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
};

const dotColors = {
  default: 'bg-slate-400',
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-indigo-500',
};

export function Badge({ children, variant = 'default', size = 'sm', dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
}

export function PriceChangeBadge({ changePercent }: { changePercent: number }) {
  if (changePercent === 0) return null;

  const isDown = changePercent < 0;
  const prefix = isDown ? '' : '+';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        isDown
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-rose-50 text-rose-700'
      )}
    >
      {isDown ? '↓' : '↑'} {prefix}{changePercent.toFixed(1)}%
    </span>
  );
}
