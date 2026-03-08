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

interface RetailerComparisonData {
  retailer: string;
  price: number;
  color: string;
}

interface RetailerComparisonChartProps {
  data: RetailerComparisonData[];
}

export function RetailerComparisonChart({ data }: RetailerComparisonChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
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
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
        />
        <YAxis
          dataKey="retailer"
          type="category"
          tick={{ fontSize: 12, fill: '#374151' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          width={100}
        />
        <Tooltip
          formatter={(value: number) => [formatPrice(value), 'Fiyat']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Bar dataKey="price" radius={[0, 4, 4, 0]} barSize={28}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
