import Link from 'next/link'
import clsx from 'clsx'
import type { ReviewFilters } from '@/lib/reviews'

type Counters = {
  total: number
  inbox: number
  byStatus: Record<string, number>
  byMarketplace: Record<string, number>
}

/** Собирает ссылку, меняя часть фильтров и всегда сбрасывая страницу. */
function href(filters: ReviewFilters, patch: Partial<ReviewFilters>) {
  const next = { ...filters, ...patch, page: 1 }
  const params = new URLSearchParams()

  if (next.marketplace !== 'all') params.set('mp', next.marketplace)
  if (next.status !== 'all') params.set('status', next.status)
  if (next.rating !== null) params.set('rating', String(next.rating))
  if (next.query) params.set('q', next.query)

  const query = params.toString()
  return query ? `/reviews?${query}` : '/reviews'
}

function Chip({ active, to, children }: { active: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} className={clsx('chip', active && 'chip-active')}>
      {children}
    </Link>
  )
}

export function Filters({ filters, counters }: { filters: ReviewFilters; counters: Counters }) {
  const statuses: Array<{ value: ReviewFilters['status']; label: string; count?: number }> = [
    { value: 'inbox', label: 'К ответу', count: counters.inbox },
    { value: 'all', label: 'Все', count: counters.total },
    { value: 'queued', label: 'В очереди', count: counters.byStatus.queued },
    { value: 'sent', label: 'Отвечены', count: counters.byStatus.sent },
    { value: 'failed', label: 'Ошибки', count: counters.byStatus.failed },
    { value: 'skipped', label: 'Без ответа', count: counters.byStatus.skipped },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={filters.marketplace === 'all'} to={href(filters, { marketplace: 'all' })}>
          Все площадки
          <span className="text-xs opacity-70">{counters.total}</span>
        </Chip>
        <Chip active={filters.marketplace === 'wb'} to={href(filters, { marketplace: 'wb' })}>
          Wildberries
          <span className="text-xs opacity-70">{counters.byMarketplace.wb ?? 0}</span>
        </Chip>
        <Chip active={filters.marketplace === 'ozon'} to={href(filters, { marketplace: 'ozon' })}>
          Ozon
          <span className="text-xs opacity-70">{counters.byMarketplace.ozon ?? 0}</span>
        </Chip>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <Chip
            key={status.value}
            active={filters.status === status.value}
            to={href(filters, { status: status.value })}
          >
            {status.label}
            <span className="text-xs opacity-70">{status.count ?? 0}</span>
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={filters.rating === null} to={href(filters, { rating: null })}>
          Любая оценка
        </Chip>
        {[5, 4, 3, 2, 1].map((rating) => (
          <Chip key={rating} active={filters.rating === rating} to={href(filters, { rating })}>
            {rating} ★
          </Chip>
        ))}

        <form action="/reviews" className="ml-auto flex items-center gap-2">
          {filters.marketplace !== 'all' ? (
            <input type="hidden" name="mp" value={filters.marketplace} />
          ) : null}
          {filters.status !== 'all' ? <input type="hidden" name="status" value={filters.status} /> : null}
          {filters.rating !== null ? (
            <input type="hidden" name="rating" value={filters.rating} />
          ) : null}
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Поиск по тексту, товару, SKU"
            className="field w-64"
          />
          <button type="submit" className="btn-ghost text-sm">
            Найти
          </button>
        </form>
      </div>
    </div>
  )
}
