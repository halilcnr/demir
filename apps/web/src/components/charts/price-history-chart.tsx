'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getRetailerColor } from '@repo/shared';

interface PricePoint {
  date: string;
  price: number;
  retailer: string;
}

interface PriceHistoryChartProps {
  data: PricePoint[];
}

export function PriceHistoryChart({ data }: PriceHistoryChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        Fiyat geçmişi verisi bulunamadı
      </div>
    );
  }

  const retailers = [...new Set(data.map((d) => d.retailer))];
  const dateMap = new Map<string, Record<string, number>>();

  for (const point of data) {
    const dateStr = new Date(point.date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
    });
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, {});
    }
    dateMap.get(dateStr)![point.retailer] = point.price;
  }

  const chartData = Array.from(dateMap.entries()).map(([date, prices]) => ({
    date,
    ...prices,
  }));

  const formatPrice = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatPrice(value), name]}
          labelStyle={{ color: '#374151', fontWeight: 600 }}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {retailers.map((retailer) => {
          const slug = retailer.toLowerCase().replace(/\s+/g, '');
          return (
            <Line
              key={retailer}
              type="monotone"
              dataKey={retailer}
              stroke={getRetailerColor(slug)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
