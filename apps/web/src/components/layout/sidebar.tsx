'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  Bell,
  RefreshCw,
  TrendingDown,
  Settings,
  Sparkles,
  Trophy,
  Bot,
  Gauge,
  Activity,
  BarChart3,
} from 'lucide-react';
import { cn } from '@repo/shared';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/variants', label: 'Varyantlar', icon: Smartphone },
  { href: '/best-by-storage', label: 'En Ucuz', icon: Trophy },
  { href: '/deals', label: 'Fırsatlar', icon: TrendingDown },
  { href: '/alerts', label: 'Alarmlar', icon: Bell },
  { href: '/sync', label: 'Senkronizasyon', icon: RefreshCw },
  { href: '/sync-control', label: 'Operasyon Merkezi', icon: Gauge },
  { href: '/scrape-health', label: 'Scrape Sağlık', icon: Activity },
  { href: '/analytics', label: 'Analitik', icon: BarChart3 },
  { href: '/settings/telegram', label: 'Telegram', icon: Bot },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[260px] border-r border-border bg-surface md:flex md:flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-sm">
          <Smartphone className="h-4 w-4 text-white" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-text-primary">
          Baki<span className="text-primary">Tracker</span>
        </span>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary-light text-primary shadow-xs'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              )}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-text-tertiary group-hover:text-text-secondary'
                )}
              />
              {item.label}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-text-tertiary" />
          <p className="text-[11px] font-medium text-text-tertiary tracking-wide uppercase">
            v1.0 · Price Tracker
          </p>
        </div>
      </div>
    </aside>
  );
}
