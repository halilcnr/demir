import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

const variantStyles = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-50 text-green-700 border-green-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PriceChangeBadge({ changePercent }: { changePercent: number }) {
  if (changePercent === 0) return null;

  const variant = changePercent < 0 ? 'success' : 'danger';
  const prefix = changePercent > 0 ? '+' : '';

  return (
    <Badge variant={variant}>
      {prefix}{changePercent.toFixed(1)}%
    </Badge>
  );
}
