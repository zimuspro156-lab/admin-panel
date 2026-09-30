import 'server-only'
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { MARKETPLACES, REVIEW_STATUSES, reviews, syncRuns, type Review } from '@/db/schema'

export const PAGE_SIZE = 20

export type ReviewFilters = {
  marketplace: 'all' | 'wb' | 'ozon'
  status: 'all' | 'inbox' | (typeof REVIEW_STATUSES)[number]
  rating: number | null
  query: string
  page: number
}

/** Разбирает строку запроса в фильтры, молча игнорируя мусор. */
export function parseFilters(searchParams: Record<string, string | string[] | undefined>): ReviewFilters {
  const single = (key: string) => {
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }

  const marketplace = single('mp')
  const status = single('status')
  const rating = Number(single('rating'))
  const page = Number(single('page'))

  return {
    marketplace: marketplace === 'wb' || marketplace === 'ozon' ? marketplace : 'all',
    status:
      status === 'inbox' || (REVIEW_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as ReviewFilters['status'])
        : 'all',
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    query: (single('q') ?? '').trim().slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

function buildWhere(filters: ReviewFilters): SQL | undefined {
  const conditions: SQL[] = []

  if (filters.marketplace !== 'all') {
    conditions.push(eq(reviews.marketplace, filters.marketplace))
  }

  if (filters.status === 'inbox') {
    // Рабочая очередь: всё, что ещё требует внимания оператора.
    conditions.push(inArray(reviews.status, ['new', 'failed']))
  } else if (filters.status !== 'all') {
    conditions.push(eq(reviews.status, filters.status))
  }

  if (filters.rating !== null) {
    conditions.push(eq(reviews.rating, filters.rating))
  }

  if (filters.query) {
    const pattern = `%${filters.query}%`
    const search = or(
      ilike(reviews.text, pattern),
      ilike(reviews.productName, pattern),
      ilike(reviews.productSku, pattern),
      ilike(reviews.productArticle, pattern),
      ilike(reviews.authorName, pattern),
    )
    if (search) conditions.push(search)
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function listReviews(filters: ReviewFilters): Promise<{ items: Review[]; total: number }> {
  const where = buildWhere(filters)

  const [items, [totals]] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(where)
      .orderBy(desc(sql`coalesce(${reviews.mpCreatedAt}, ${reviews.createdAt})`), desc(reviews.id))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(reviews).where(where),
  ])

  return { items, total: totals?.value ?? 0 }
}

/** Счётчики для верхней панели: по статусам и по маркетплейсам. */
export async function getReviewCounters() {
  const rows = await db
    .select({ marketplace: reviews.marketplace, status: reviews.status, value: count() })
    .from(reviews)
    .groupBy(reviews.marketplace, reviews.status)

  const byStatus = new Map<string, number>()
  const byMarketplace = new Map<string, number>()
  let inbox = 0
  let total = 0

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.value)
    byMarketplace.set(row.marketplace, (byMarketplace.get(row.marketplace) ?? 0) + row.value)
    if (row.status === 'new' || row.status === 'failed') inbox += row.value
    total += row.value
  }

  return {
    total,
    inbox,
    byStatus: Object.fromEntries(byStatus) as Record<string, number>,
    byMarketplace: Object.fromEntries(byMarketplace) as Record<string, number>,
  }
}

/** Последний прогон синхронизации по каждому маркетплейсу. */
export async function getLastSyncRuns() {
  const result: Record<string, { startedAt: Date; fetched: number; created: number; status: string; error: string | null } | null> =
    {}

  for (const marketplace of MARKETPLACES) {
    const [row] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.marketplace, marketplace))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)

    result[marketplace] = row
      ? {
          startedAt: row.startedAt,
          fetched: row.fetched,
          created: row.created,
          status: row.status,
          error: row.error,
        }
      : null
  }

  return result
}
