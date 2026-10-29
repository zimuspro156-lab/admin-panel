import 'server-only'
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, reviews, syncRuns, type Marketplace } from '@/db/schema'
import { generateDraft } from './ai'
import { decideAutoReply } from './autoreply'
import { OZON_EMPTY_REVIEW_NOTE, fetchOzonReviews, isOzonReviewAnswerable } from './mp/ozon'
import { fetchWbArchive, fetchWbReviews } from './mp/wb'
import type { NormalizedReview } from './mp/types'

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
  if (incoming.length === 0) return { created: [] as number[], inserted: 0, updated: 0 }

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
  /** Новые отзывы, которым нужен черновик. */
  const created: number[] = []
  /** Все новые строки, включая уже отвеченные на маркетплейсе. */
  let inserted = 0
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

      // Если ответ на него невозможен, убираем его из работы - в том числе
      // те, что успели упасть с ошибкой до появления этой проверки.
      if (marketplace === 'ozon' && !isOzonReviewAnswerable(review.raw)) {
        await db
          .update(reviews)
          .set({ status: 'skipped', lastError: OZON_EMPTY_REVIEW_NOTE, updatedAt: now })
          .where(
            and(
              eq(reviews.marketplace, marketplace),
              eq(reviews.externalId, review.externalId),
              inArray(reviews.status, ['new', 'failed']),
            ),
          )
      }

      updated += 1
      continue
    }

    // Отзыв, на который маркетплейс всё равно не примет ответ, сразу уходит
    // в «без ответа»: оператору он не нужен, а черновик для него - деньги на ветер.
    const answerable = marketplace !== 'ozon' || isOzonReviewAnswerable(review.raw)

    let initial: Record<string, unknown>
    if (review.alreadyAnswered) {
      // История: ответ уже дан на маркетплейсе, в работу отзыв не берём
      // и черновик не генерируем.
      initial = {
        status: 'sent' as const,
        answerText: review.existingAnswer ?? null,
        answerSource: 'imported' as const,
      }
    } else if (answerable) {
      initial = { status: 'new' as const }
    } else {
      initial = { status: 'skipped' as const, lastError: OZON_EMPTY_REVIEW_NOTE }
    }

    const [row] = await db
      .insert(reviews)
      .values({ marketplace, externalId: review.externalId, ...content, ...initial })
      .returning({ id: reviews.id })

    if (row) inserted += 1
    if (row && answerable && !review.alreadyAnswered) created.push(row.id)
  }

  return { created, inserted, updated }
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

/**
 * Переносит в «без ответа» отзывы, которые успели упасть с отказом Ozon
 * «cannot comment on empty review» до того, как панель научилась его понимать.
 * Иначе они навсегда остались бы красными карточками, которые оператор
 * всё равно не может исправить.
 */
async function healEmptyReviewFailures() {
  await db.execute(sql`
    update reviews
    set status = 'skipped', last_error = ${OZON_EMPTY_REVIEW_NOTE}, updated_at = now()
    where marketplace = 'ozon'
      and status = 'failed'
      and last_error ilike '%cannot comment on empty review%'
  `)
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

  if (marketplace === 'ozon') await healEmptyReviewFailures()

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

export type HistoryImport = {
  marketplace: Marketplace
  ok: boolean
  fetched: number
  created: number
  error: string | null
}

/**
 * Разовая загрузка истории: тянет и уже отвеченные отзывы, включая архив WB.
 * Отдельно от часовой выгрузки намеренно - перебирать весь архив каждый час
 * незачем, а объём там на порядки больше рабочей очереди.
 */
export async function importHistory(): Promise<HistoryImport[]> {
  const credentials = await getIntegrations()
  const results: HistoryImport[] = []

  const wb: HistoryImport = { marketplace: 'wb', ok: false, fetched: 0, created: 0, error: null }
  if (!credentials.wbToken) {
    wb.error = 'Токен Wildberries не задан в разделе «Подключения»'
  } else {
    const parts = await Promise.all([
      fetchWbReviews(credentials.wbToken, { answered: true, maxPages: 50 }),
      fetchWbArchive(credentials.wbToken, 50),
    ])
    const failed = parts.find((part) => !part.ok)
    if (failed && !failed.ok) {
      wb.error = failed.error
    } else {
      const all = parts.flatMap((part) => (part.ok ? part.reviews : []))
      const { inserted } = await upsert('wb', all)
      wb.ok = true
      wb.fetched = all.length
      wb.created = inserted
    }
  }
  results.push(wb)

  const ozon: HistoryImport = { marketplace: 'ozon', ok: false, fetched: 0, created: 0, error: null }
  if (!credentials.ozon) {
    ozon.error = 'Ключи Ozon не заданы в разделе «Подключения»'
  } else {
    const fetched = await fetchOzonReviews(credentials.ozon, { status: 'ALL', maxPages: 50 })
    if (!fetched.ok) {
      ozon.error = fetched.error
    } else {
      const { inserted } = await upsert('ozon', fetched.reviews)
      ozon.ok = true
      ozon.fetched = fetched.reviews.length
      ozon.created = inserted
    }
  }
  results.push(ozon)

  for (const result of results) {
    await db.insert(syncRuns).values({
      marketplace: result.marketplace,
      fetched: result.fetched,
      created: result.created,
      status: result.error ? 'error' : 'ok',
      error: result.error,
    })
  }

  return results
}

/** Полный прогон: площадки независимы, падение одной не мешает другой. */
export async function syncAll(): Promise<MarketplaceSync[]> {
  const results: MarketplaceSync[] = []
  for (const marketplace of ['wb', 'ozon'] as const) {
    results.push(await syncMarketplace(marketplace))
  }
  return results
}
