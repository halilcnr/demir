'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { getRetailerColor } from '@repo/shared';

interface RetailerComparisonData {
  retailer: string;
  retailerSlug: string;
  price: number;
}

interface RetailerComparisonChartProps {
  data: RetailerComparisonData[];
}

export function RetailerComparisonChart({ data }: RetailerComparisonChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-text-tertiary">
        Karşılaştırma verisi bulunamadı
      </div>
    );
  }

  const formatPrice = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
        />
        <YAxis
          dataKey="retailer"
          type="category"
          tick={{ fontSize: 12, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <Tooltip
          formatter={(value: number) => [formatPrice(value), 'Fiyat']}
          labelStyle={{ color: '#1e293b', fontWeight: 600, fontSize: 12 }}
          itemStyle={{ fontSize: 12 }}
          contentStyle={{
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            padding: '8px 12px',
            background: '#ffffff',
          }}
        />
        <Bar dataKey="price" radius={[0, 6, 6, 0]} barSize={24}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getRetailerColor(entry.retailerSlug)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
