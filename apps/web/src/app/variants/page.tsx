'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput });
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Varyant ara…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </form>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className="rounded-lg border border-gray-200 py-2 px-3 text-sm outline-none"
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
            className="rounded-lg border border-gray-200 py-2 px-3 text-sm outline-none"
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
            className="rounded-lg border border-gray-200 py-2 px-3 text-sm outline-none"
          >
            <option value="">Tüm Ürünler</option>
            <option value="true">Sadece Fırsatlar</option>
          </select>

          {(search || family || storage || color || isDeal) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchInput('');
                router.push('/variants');
              }}
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Temizle
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Varyant
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Depolama
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Renk
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                En Düşük Fiyat
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                Mağazalar
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                Durum
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Son Güncelleme
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
                <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/variants/${v.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600 text-sm"
                    >
                      {v.familyName} {v.storageGb}GB {v.color}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {v.storageGb >= 1024 ? `${v.storageGb / 1024} TB` : `${v.storageGb} GB`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{v.color}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {v.minPrice != null ? formatPrice(v.minPrice) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-600">{v.listingCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {v.isDeal ? (
                      <Badge variant="success">Fırsat</Badge>
                    ) : (
                      <Badge variant="default">Normal</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Toplam {data.total} varyant, sayfa {data.page}/{data.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
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
