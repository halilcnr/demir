'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Bell,
  Smartphone,
  LayoutDashboard,
  TrendingDown,
  RefreshCw,
  Settings,
  Search,
  Gauge,
  Zap,
  ZapOff,
  Terminal,
  VolumeX,
  Radio,
  Radar,
} from 'lucide-react';
import { cn } from '@repo/shared';
import { SyncStatusPill } from '../sync-status-pill';
import { useLiveUpdates } from '../live-updates-context';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/variants', label: 'Varyantlar', icon: Smartphone },
  { href: '/deals', label: 'Fırsatlar', icon: TrendingDown },
  { href: '/alerts', label: 'Alarmlar', icon: Bell },
  { href: '/sync', label: 'Senkronizasyon', icon: RefreshCw },
  { href: '/sync-control', label: 'Operasyon Merkezi', icon: Gauge },
  { href: '/command-center', label: 'Komuta Merkezi', icon: Radio },
  { href: '/scrape-diagnostics', label: 'Scrape Teşhisi', icon: Radar },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { enabled: liveEnabled, toggle: toggleLive, logsSilent, toggleLogsSilent } = useLiveUpdates();

  const currentPage = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== '/' && pathname.startsWith(item.href))
  );

  return (
    <>
      <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6">
        {/* Mobile menu toggle */}
        <button
          className="md:hidden rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        {/* Page title + breadcrumb */}
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-text-primary tracking-tight">
            {currentPage?.label ?? 'Dashboard'}
          </h1>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* Search hint */}
          <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-text-tertiary">
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Ara...</span>
            <kbd className="ml-4 hidden rounded border border-border bg-surface-secondary px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary lg:inline">
              ⌘K
            </kbd>
          </div>

          <SyncStatusPill />

          <button
            onClick={toggleLive}
            className={`group relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
              liveEnabled
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-surface-secondary text-text-tertiary border-border hover:bg-surface-secondary/80'
            }`}
            title={liveEnabled ? 'Canlı güncellemeler açık — kapat' : 'Canlı güncellemeler kapalı — aç'}
          >
            {liveEnabled ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
            <span className="hidden sm:inline">{liveEnabled ? 'Canlı' : 'Durdur.'}</span>
            <div className="absolute top-full right-0 mt-1 hidden group-hover:block z-50">
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary shadow-lg whitespace-nowrap">
                {liveEnabled ? 'Otomatik yenileme açık — tıkla kapat' : 'Otomatik yenileme kapalı — tıkla aç'}
              </div>
            </div>
          </button>

          <button
            onClick={toggleLogsSilent}
            className={`group relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
              !logsSilent
                ? 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 hover:bg-cyan-500/20'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
            }`}
            title={logsSilent ? 'Log akışı sessiz — tıkla aç' : 'Log akışı aktif — sessiz moda al'}
          >
            {logsSilent ? <VolumeX className="h-3 w-3" /> : <Terminal className="h-3 w-3" />}
            <span className="hidden sm:inline">{logsSilent ? 'Sessiz' : 'Loglar'}</span>
            <div className="absolute top-full right-0 mt-1 hidden group-hover:block z-50">
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary shadow-lg whitespace-nowrap">
                {logsSilent ? 'Log akışı sessiz — tıkla aktifleştir' : 'Log akışı aktif — tıkla sessiz moda al'}
              </div>
            </div>
          </button>

          <Link
            href="/alerts"
            className="relative rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          >
            <Bell className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileMenuOpen && (
        <div className="glass border-b border-border px-4 py-3 md:hidden animate-float-in">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium',
                    isActive
                      ? 'bg-primary-light text-primary'
                      : 'text-text-secondary hover:bg-surface-secondary'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
