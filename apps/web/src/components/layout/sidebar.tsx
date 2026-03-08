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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 border-r border-gray-200 bg-white md:flex md:flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <Smartphone className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-bold text-gray-900">
          iPhone<span className="text-blue-600">Tracker</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        <p className="text-xs text-gray-400">iPhone Price Tracker v1.0</p>
      </div>
    </aside>
  );
}
