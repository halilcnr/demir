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
    <div className="flex flex-col items-center justify-center py-16 text-center animate-float-in">
      <div className="mb-4 rounded-xl bg-surface-tertiary p-4">
        {icon ?? <InboxIcon className="h-8 w-8 text-text-tertiary" />}
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-[13px] text-text-tertiary">{description}</p>
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
    <div className="flex flex-col items-center justify-center py-16 text-center animate-float-in">
      <div className="mb-4 rounded-xl bg-rose-50 p-4">
        <AlertCircle className="h-8 w-8 text-rose-400" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-[13px] text-text-tertiary">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors shadow-sm"
        >
          Tekrar Dene
        </button>
      )}
    </div>
  );
}
