import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 shadow-sm',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, className }: StatCardProps) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                trend.value < 0 ? 'text-green-600' : trend.value > 0 ? 'text-red-600' : 'text-gray-500'
              )}
            >
              {trend.value > 0 ? '+' : ''}
              {trend.value.toFixed(1)}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
