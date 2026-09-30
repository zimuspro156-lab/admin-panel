import clsx from 'clsx'

const MP_LABELS: Record<string, { label: string; className: string }> = {
  wb: { label: 'Wildberries', className: 'bg-[var(--color-wb)]/10 text-[var(--color-wb)]' },
  ozon: { label: 'Ozon', className: 'bg-[var(--color-ozon)]/10 text-[var(--color-ozon)]' },
}

export function MarketplaceBadge({ marketplace }: { marketplace: string }) {
  const meta = MP_LABELS[marketplace] ?? { label: marketplace, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={clsx('rounded-md px-2 py-0.5 text-xs font-semibold', meta.className)}>
      {meta.label}
    </span>
  )
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: 'Новый', className: 'bg-amber-50 text-amber-700' },
  queued: { label: 'В очереди', className: 'bg-blue-50 text-blue-700' },
  sending: { label: 'Отправляется', className: 'bg-blue-50 text-blue-700' },
  sent: { label: 'Отвечен', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Ошибка', className: 'bg-red-50 text-red-700' },
  skipped: { label: 'Без ответа', className: 'bg-gray-100 text-gray-600' },
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', meta.className)}>
      {meta.label}
    </span>
  )
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-sm text-[var(--color-muted)]">без оценки</span>

  return (
    <span
      className={clsx('text-sm font-medium', rating <= 3 ? 'text-red-600' : 'text-amber-500')}
      title={`${rating} из 5`}
    >
      {'★'.repeat(rating)}
      <span className="text-[var(--color-line)]">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}
