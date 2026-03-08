import { cn } from '@repo/shared';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className, onClick, hover = !!onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-5 shadow-xs',
        hover && 'cursor-pointer hover:shadow-md hover:border-border/80 hover:-translate-y-0.5 transition-all duration-200',
        !hover && 'transition-shadow duration-200',
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
  accentColor?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, className, accentColor }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {/* Subtle gradient accent */}
      {accentColor && (
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `linear-gradient(to right, ${accentColor}, transparent)` }}
        />
      )}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-text-primary animate-count-up">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-text-tertiary">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  trend.value < 0
                    ? 'bg-emerald-50 text-emerald-600'
                    : trend.value > 0
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-slate-50 text-slate-600'
                )}
              >
                {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'}{' '}
                {Math.abs(trend.value).toFixed(1)}%
              </span>
              <span className="text-[11px] text-text-tertiary">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
