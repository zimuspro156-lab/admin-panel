import 'server-only'
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, reviews, syncRuns, type Marketplace } from '@/db/schema'
import { generateDraft } from './ai'
import { decideAutoReply } from './autoreply'
import { fetchOzonReviews } from './mp/ozon'
import type { NormalizedReview } from './mp/types'
import { fetchWbReviews } from './mp/wb'
import { getIntegrations, getSettings } from './settings'

export type MarketplaceSync = {
  marketplace: Marketplace
  ok: boolean
  fetched: number
  created: number
  updated: number
  drafted: number
  queued: number
  error: string | null
}

/** Сколько черновиков генерируем за один прогон: защита от счёта за OpenAI. */
const MAX_DRAFTS_PER_RUN = 100

async function upsert(marketplace: Marketplace, incoming: NormalizedReview[]) {
  if (incoming.length === 0) return { created: [] as number[], updated: 0 }

  const known = await db
    .select({ externalId: reviews.externalId })
    .from(reviews)
    .where(
      and(
        eq(reviews.marketplace, marketplace),
        inArray(
          reviews.externalId,
          incoming.map((review) => review.externalId),
        ),
      ),
    )

  const knownIds = new Set(known.map((row) => row.externalId))
  const created: number[] = []
  let updated = 0
  const now = new Date()

  for (const review of incoming) {
    const content = {
      rating: review.rating,
      text: review.text,
      pros: review.pros,
      cons: review.cons,
      authorName: review.authorName,
      productName: review.productName,
      productSku: review.productSku,
      productBrand: review.productBrand,
      productArticle: review.productArticle,
      photos: review.photos,
      mpCreatedAt: review.mpCreatedAt,
      raw: review.raw,
      updatedAt: now,
    }

    if (knownIds.has(review.externalId)) {
      // Уже отвеченный или подтверждённый отзыв не откатываем: обновляем только текст.
      await db
        .update(reviews)
        .set(content)
        .where(and(eq(reviews.marketplace, marketplace), eq(reviews.externalId, review.externalId)))
      updated += 1
      continue
    }

    const [row] = await db
      .insert(reviews)
      .values({ marketplace, externalId: review.externalId, status: 'new', ...content })
      .returning({ id: reviews.id })

    if (row) created.push(row.id)
  }

  return { created, updated }
}

/**
 * Генерирует черновики для отзывов, которые их ещё ждут, и, если автоответ
 * включён, ставит их в очередь. Берём не только созданные в этом прогоне:
 * иначе отзывы, не попавшие в лимит прошлого раза, остались бы без черновика
 * навсегда. Так каждый следующий прогон догоняет отставание.
 */
async function draftPending(marketplace: Marketplace) {
  const [config, credentials] = await Promise.all([getSettings(), getIntegrations()])
  if (!credentials.openaiApiKey) {
    return { drafted: 0, queued: 0, error: 'Ключ OpenAI не задан в разделе «Подключения»' }
  }

  const targets = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.marketplace, marketplace),
        eq(reviews.status, 'new'),
        isNull(reviews.aiDraft),
      ),
    )
    .orderBy(desc(reviews.mpCreatedAt))
    .limit(MAX_DRAFTS_PER_RUN)

  if (targets.length === 0) return { drafted: 0, error: null as string | null }

  let drafted = 0
  let error: string | null = null
  const now = new Date()

  for (const review of targets) {
    const result = await generateDraft(credentials.openaiApiKey, config.aiModel, config.aiPrompt, review)

    if (!result.ok) {
      // Отзыв не теряем: он останется оператору с пустым черновиком.
      error = error ?? result.error
      continue
    }

    drafted += 1
    await db
      .update(reviews)
      .set({
        aiDraft: result.draft,
        aiModel: result.model,
        aiGeneratedAt: now,
        updatedAt: now,
      })
      .where(and(eq(reviews.id, review.id), eq(reviews.status, 'new')))
  }

  return { drafted, error }
}

/**
 * Ставит в очередь всё, что готово к автоответу. Отдельный шаг от генерации:
 * иначе включение автоответа не подхватывало бы отзывы, черновики для которых
 * сделали раньше, и они висели бы необработанными.
 */
async function queueDrafted(marketplace: Marketplace) {
  const config = await getSettings()

  const pending = await db
    .select({ id: reviews.id, aiDraft: reviews.aiDraft })
    .from(reviews)
    .where(
      and(
        eq(reviews.marketplace, marketplace),
        eq(reviews.status, 'new'),
        isNotNull(reviews.aiDraft),
      ),
    )

  let queued = 0
  const now = new Date()

  for (const review of pending) {
    const decision = decideAutoReply(review.aiDraft, config)
    if (!decision.auto) continue

    const updated = await db
      .update(reviews)
      .set({
        status: 'queued',
        answerText: decision.answerText,
        answerSource: 'auto',
        updatedAt: now,
      })
      .where(and(eq(reviews.id, review.id), eq(reviews.status, 'new')))
      .returning({ id: reviews.id })

    if (updated.length > 0) queued += 1
  }

  if (queued > 0) {
    await db.insert(auditLog).values({ action: 'autoreply.queued', meta: { marketplace, count: queued } })
  }

  return queued
}

async function syncMarketplace(marketplace: Marketplace): Promise<MarketplaceSync> {
  const base: MarketplaceSync = {
    marketplace,
    ok: false,
    fetched: 0,
    created: 0,
    updated: 0,
    drafted: 0,
    queued: 0,
    error: null,
  }

  const credentials = await getIntegrations()

  let fetched
  if (marketplace === 'wb') {
    fetched = credentials.wbToken
      ? await fetchWbReviews(credentials.wbToken)
      : ({ ok: false, error: 'Токен Wildberries не задан в разделе «Подключения»' } as const)
  } else {
    fetched = credentials.ozon
      ? await fetchOzonReviews(credentials.ozon)
      : ({ ok: false, error: 'Ключи Ozon не заданы в разделе «Подключения»' } as const)
  }

  if (!fetched.ok) {
    await db.insert(syncRuns).values({ marketplace, status: 'error', error: fetched.error })
    return { ...base, error: fetched.error }
  }

  const { created, updated } = await upsert(marketplace, fetched.reviews)
  const drafts = await draftPending(marketplace)
  const queued = await queueDrafted(marketplace)

  await db.insert(syncRuns).values({
    marketplace,
    fetched: fetched.reviews.length,
    created: created.length,
    status: drafts.error ? 'error' : 'ok',
    error: drafts.error,
  })

  return {
    ...base,
    ok: true,
    fetched: fetched.reviews.length,
    created: created.length,
    updated,
    drafted: drafts.drafted,
    queued,
    error: drafts.error,
  }
}

/** Полный прогон: площадки независимы, падение одной не мешает другой. */
export async function syncAll(): Promise<MarketplaceSync[]> {
  const results: MarketplaceSync[] = []
  for (const marketplace of ['wb', 'ozon'] as const) {
    results.push(await syncMarketplace(marketplace))
  }
  return results
}
