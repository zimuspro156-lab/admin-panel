import Link from 'next/link'
import { Filters } from '@/components/filters'
import { ReviewCard, type ReviewCardData } from '@/components/review-card'
import { formatDateTime, plural } from '@/lib/format'
import { PAGE_SIZE, getLastSyncRuns, getReviewCounters, listReviews, parseFilters } from '@/lib/reviews'
import { getSettings } from '@/lib/settings'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  await requireUser()

  const filters = parseFilters(await searchParams)
  const [{ items, total }, counters, syncRuns, config] = await Promise.all([
    listReviews(filters),
    getReviewCounters(),
    getLastSyncRuns(),
    getSettings(),
  ])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const cards: ReviewCardData[] = items.map((review) => ({
    id: review.id,
    marketplace: review.marketplace,
    rating: review.rating,
    text: review.text,
    pros: review.pros,
    cons: review.cons,
    authorName: review.authorName,
    productName: review.productName,
    productSku: review.productSku,
    productArticle: review.productArticle,
    photos: review.photos ?? [],
    status: review.status,
    aiDraft: review.aiDraft,
    answerText: review.answerText,
    answerSource: review.answerSource,
    lastError: review.lastError,
    createdAtLabel: formatDateTime(review.mpCreatedAt ?? review.createdAt),
    sentAtLabel: review.sentAt ? formatDateTime(review.sentAt) : null,
  }))

  function pageHref(page: number) {
    const params = new URLSearchParams()
    if (filters.marketplace !== 'all') params.set('mp', filters.marketplace)
    if (filters.status !== 'all') params.set('status', filters.status)
    if (filters.rating !== null) params.set('rating', String(filters.rating))
    if (filters.query) params.set('q', filters.query)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/reviews?${query}` : '/reviews'
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Отзывы</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {config.autoReplyEnabled
            ? 'Автоответ включён: черновики ИИ уходят на маркетплейс сами'
            : 'Автоответ выключен, всё уходит только после подтверждения оператором'}
        </p>
      </div>

      <div className="card flex flex-wrap gap-x-8 gap-y-2 p-4 text-sm">
        {Object.entries(syncRuns).map(([marketplace, run]) => (
          <div key={marketplace}>
            <p className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
              {marketplace === 'wb' ? 'Wildberries' : 'Ozon'}
            </p>
            {run ? (
              <p className={run.status === 'ok' ? '' : 'text-red-700'}>
                {formatDateTime(run.startedAt)} · получено {run.fetched}, новых {run.created}
                {run.error ? ` · ${run.error}` : ''}
              </p>
            ) : (
              <p className="text-[var(--color-muted)]">синхронизаций ещё не было</p>
            )}
          </div>
        ))}
      </div>

      <Filters filters={filters} counters={counters} />

      <p className="text-sm text-[var(--color-muted)]">
        {total} {plural(total, 'отзыв', 'отзыва', 'отзывов')} в выборке
      </p>

      <div className="space-y-4">
        {cards.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
            Здесь пусто. Отзывы появятся после первого прогона воркфлоу n8n.
          </div>
        ) : (
          cards.map((review) => <ReviewCard key={review.id} review={review} />)
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {filters.page > 1 ? (
            <Link href={pageHref(filters.page - 1)} className="btn-ghost text-sm">
              Назад
            </Link>
          ) : null}
          <span className="text-sm text-[var(--color-muted)]">
            {filters.page} из {pages}
          </span>
          {filters.page < pages ? (
            <Link href={pageHref(filters.page + 1)} className="btn-ghost text-sm">
              Вперёд
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
