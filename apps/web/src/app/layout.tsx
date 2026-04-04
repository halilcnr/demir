import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { QueryProvider } from './providers';
import { LiveUpdatesProvider } from '@/components/live-updates-context';

export const metadata: Metadata = {
  title: 'Fiyat Takip - Deal Dashboard',
  description: 'Türkiye e-ticaret sitelerinden iPhone & Samsung fiyat takip ve fırsat tespit paneli',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <QueryProvider>
          <LiveUpdatesProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
                  {children}
                </main>
              </div>
            </div>
          </LiveUpdatesProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
