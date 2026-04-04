'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, Filter, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { CardSkeleton } from '@/components/ui/skeleton';

const STORAGE_OPTIONS = ['128GB', '256GB', '512GB', '1TB'];
const MODEL_FAMILIES = [
  // iPhone
  'iPhone 13',
  'iPhone 14',
  'iPhone 15',
  'iPhone 16',
  'iPhone 16 Pro',
  'iPhone 16 Pro Max',
  'iPhone 17',
  'iPhone 17 Air',
  'iPhone 17 Pro',
  'iPhone 17 Pro Max',
  // Samsung
  'Galaxy S26 Ultra',
  'Galaxy S25 Ultra',
  'Galaxy S24 Ultra',
  'Galaxy A56',
  'Galaxy A36',
];
const SORT_OPTIONS = [
  { value: 'name', label: 'İsim (A-Z)' },
  { value: 'price_asc', label: 'Fiyat (Düşük → Yüksek)' },
  { value: 'price_desc', label: 'Fiyat (Yüksek → Düşük)' },
  { value: 'updated', label: 'Son Güncelleme' },
];

interface ProductListItem {
  id: string;
  model: string;
  storage: string;
  color?: string | null;
  slug: string;
  minPrice: number | null;
  listingCount: number;
  retailers: { name: string; slug: string; price: number | null; inStock: boolean }[];
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const queryString = new URLSearchParams({
    ...(search && { search }),
    ...(model && { model }),
    ...(storage && { storage }),
    sort,
    page: String(page),
    limit: '20',
  }).toString();

  const { data, isLoading, error, refetch } = useQuery<{
    data: ProductListItem[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ['products', queryString],
    queryFn: () => fetch(`/api/products?${queryString}`).then((r) => r.json()),
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <Card className="!p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Model ara... (ör: iPhone 15 Pro, Galaxy S25 Ultra)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={<Filter className="h-4 w-4" />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtreler
            <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Tüm Modeller</option>
              {MODEL_FAMILIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              value={storage}
              onChange={(e) => { setStorage(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Tüm Kapasiteler</option>
              {STORAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Ürün bulunamadı"
          description="Arama kriterlerini değiştirerek tekrar deneyin"
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {data.total} ürün bulundu
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((product) => (
              <Link key={product.id} href={`/products/${product.id}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <div className="mb-3">
                    <h3 className="font-semibold text-gray-900">
                      {product.model}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge>{product.storage}</Badge>
                      {product.color && (
                        <Badge variant="info">{product.color}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Min fiyat */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-500">En düşük fiyat</p>
                    <p className="text-xl font-bold text-blue-600">
                      {product.minPrice ? formatPrice(product.minPrice) : '—'}
                    </p>
                  </div>

                  {/* Retailer fiyatları */}
                  <div className="space-y-1.5">
                    {product.retailers.map((r) => (
                      <div
                        key={r.slug}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-500">{r.name}</span>
                        <span className={`font-medium ${r.inStock ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {r.price ? formatPrice(r.price) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      {product.listingCount} mağazada listeleniyor
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Önceki
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
