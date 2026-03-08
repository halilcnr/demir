'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback, Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableRowSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { formatPrice, formatRelativeDate } from '@repo/shared';
import type { PaginatedResponse, VariantListItem } from '@repo/shared';

function VariantsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const family = searchParams.get('family') ?? '';
  const storage = searchParams.get('storage') ?? '';
  const color = searchParams.get('color') ?? '';
  const isDeal = searchParams.get('isDeal') ?? '';
  const sort = searchParams.get('sort') ?? 'name';

  const [searchInput, setSearchInput] = useState(search);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      if (!updates.page) sp.set('page', '1');
      router.push(`/variants?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', '20');
  if (search) qs.set('search', search);
  if (family) qs.set('family', family);
  if (storage) qs.set('storage', storage);
  if (color) qs.set('color', color);
  if (isDeal) qs.set('isDeal', isDeal);
  if (sort) qs.set('sort', sort);

  const { data, isLoading, error, refetch } = useQuery<PaginatedResponse<VariantListItem>>({
    queryKey: ['variants', page, search, family, storage, color, isDeal, sort],
    queryFn: () => fetch(`/api/products?${qs.toString()}`).then((r) => r.json()),
  });

  if (error) return <ErrorState onRetry={() => refetch()} />;

  const hasFilters = !!(search || family || storage || color || isDeal);

  return (
    <div className="space-y-5 animate-float-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Varyantlar</h1>
        {data && (
          <span className="text-xs text-text-tertiary">
            {data.total} ürün
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput });
          }}
        >
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Varyant ara..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
        </form>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className="rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-secondary outline-none focus:border-primary"
          >
            <option value="name">İsim</option>
            <option value="price_asc">Fiyat ↑</option>
            <option value="price_desc">Fiyat ↓</option>
            <option value="updated">Güncelleme</option>
            <option value="deal_score">Fırsat Puanı</option>
          </select>

          <select
            value={storage}
            onChange={(e) => updateParams({ storage: e.target.value })}
            className="rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-secondary outline-none focus:border-primary"
          >
            <option value="">Tüm Depolama</option>
            <option value="128">128 GB</option>
            <option value="256">256 GB</option>
            <option value="512">512 GB</option>
            <option value="1024">1 TB</option>
          </select>

          <select
            value={isDeal}
            onChange={(e) => updateParams({ isDeal: e.target.value })}
            className="rounded-lg border border-border bg-surface py-2 px-3 text-[13px] text-text-secondary outline-none focus:border-primary"
          >
            <option value="">Tüm Ürünler</option>
            <option value="true">Sadece Fırsatlar</option>
          </select>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchInput('');
                router.push('/variants');
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Temizle
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full divide-y divide-border">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Varyant
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Depolama
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Renk
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                En Düşük Fiyat
              </th>
              <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Mağazalar
              </th>
              <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Durum
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Son Güncelleme
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={7} />
              ))
            ) : !data || data.data.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12">
                  <EmptyState description="Filtrelere uygun varyant bulunamadı" />
                </td>
              </tr>
            ) : (
              data.data.map((v) => (
                <tr key={v.id} className="group hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/variants/${v.id}`}
                      className="text-[13px] font-medium text-text-primary hover:text-primary"
                    >
                      {v.familyName} {v.storageGb}GB {v.color}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-text-secondary">
                    {v.storageGb >= 1024 ? `${v.storageGb / 1024} TB` : `${v.storageGb} GB`}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-text-secondary">{v.color}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                      {v.minPrice != null ? formatPrice(v.minPrice) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[13px] text-text-secondary tabular-nums">{v.listingCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {v.isDeal ? (
                      <Badge variant="success" dot>Fırsat</Badge>
                    ) : (
                      <Badge variant="default">Normal</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-text-tertiary">
                    {v.lastSeenAt ? formatRelativeDate(v.lastSeenAt) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-text-tertiary">
            Sayfa {data.page}/{data.totalPages} · Toplam {data.total} varyant
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VariantsPage() {
  return (
    <Suspense fallback={<div className="space-y-4">{Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}</div>}>
      <VariantsContent />
    </Suspense>
  );
}
