import type React from 'react';
import { AlertCircle, InboxIcon } from 'lucide-react';

export function EmptyState({
  title = 'Veri bulunamadı',
  description = 'Henüz gösterilecek veri yok.',
  icon,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon ?? <InboxIcon className="h-12 w-12 text-gray-300 mb-3" />}
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Bir hata oluştu',
  description = 'Veriler yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-300 mb-3" />
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Tekrar Dene
        </button>
      )}
    </div>
  );
}
