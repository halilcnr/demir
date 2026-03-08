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
} from 'lucide-react';
import { cn } from '@repo/shared';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/variants', label: 'Varyantlar', icon: Smartphone },
  { href: '/deals', label: 'Fırsatlar', icon: TrendingDown },
  { href: '/alerts', label: 'Alarmlar', icon: Bell },
  { href: '/sync', label: 'Senkronizasyon', icon: RefreshCw },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const currentPage = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== '/' && pathname.startsWith(item.href))
  );

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Page title */}
        <h1 className="text-lg font-semibold text-gray-900">
          {currentPage?.label ?? 'Dashboard'}
        </h1>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link
            href="/alerts"
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Bell className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Mobile nav */}
      {mobileMenuOpen && (
        <div className="border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <nav className="space-y-1">
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
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <item.icon className="h-5 w-5" />
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
