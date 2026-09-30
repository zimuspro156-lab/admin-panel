import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, reviews } from '@/db/schema'
import { OZON_EMPTY_REVIEW_NOTE, answerOzonReview, isOzonReviewAnswerable } from './mp/ozon'
import type { SendResult } from './mp/types'
import { answerWbReview } from './mp/wb'
import { getIntegrations, getSettings } from './settings'

type LeasedRow = {
  id: number
  marketplace: string
  external_id: string
  answer_text: string
  answer_source: string | null
  raw: unknown
}

/**
 * Защита от заваливания API маркетплейса, когда автоответ включён и разом
 * приехала большая выгрузка. Это технический предохранитель, а не настройка:
 * ручные ответы оператора он не ограничивает.
 */
const AUTO_SENDS_PER_HOUR = 60

/**
 * Забирает готовые ответы и переводит их в sending одним запросом.
 * FOR UPDATE SKIP LOCKED нужен, чтобы параллельные вызовы (расписание n8n и
 * нажатие «Поставить») не взяли один отзыв и не отправили ответ дважды.
 */
async function lease(limit: number, reviewId?: number): Promise<LeasedRow[]> {
  if (limit <= 0) return []

  const result = await db.execute<LeasedRow>(sql`
    update reviews as r
    set status = 'sending',
        attempts = r.attempts + 1,
        updated_at = now()
    where r.id in (
      select id from reviews
      where status = 'queued'
        and answer_text is not null
        and answer_text <> ''
        ${reviewId ? sql`and id = ${reviewId}` : sql``}
      order by id asc
      for update skip locked
      limit ${limit}
    )
    returning r.id, r.marketplace, r.external_id, r.answer_text, r.answer_source, r.raw
  `)

  return result.rows
}

async function autoBudget(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from reviews
    where answer_source = 'auto'
      and sent_at is not null
      and sent_at > now() - interval '1 hour'
  `)
  return Math.max(0, AUTO_SENDS_PER_HOUR - Number(result.rows[0]?.count ?? 0))
}

export type DispatchSummary = {
  attempted: number
  sent: number
  failed: number
  /** Отзывы, на которые маркетплейс не принимает ответ в принципе. */
  skipped: number
  errors: string[]
}

/**
 * Отправляет очередь на маркетплейсы. Вызывается и по расписанию из n8n,
 * и сразу после нажатия «Поставить» - во втором случае с конкретным reviewId.
 */
export async function dispatchQueue(options: { limit?: number; reviewId?: number } = {}): Promise<DispatchSummary> {
  const limit = options.limit ?? 25
  const [config, credentials] = await Promise.all([getSettings(), getIntegrations()])

  // Ручной ответ оператор уже подтвердил, его предохранитель не касается.
  const budget = options.reviewId ? limit : Math.min(limit, Math.max(1, await autoBudget()))
  const leased = await lease(budget, options.reviewId)

  const summary: DispatchSummary = { attempted: leased.length, sent: 0, failed: 0, skipped: 0, errors: [] }
  const now = new Date()

  for (const row of leased) {
    // Ответ на пустой отзыв Ozon отклонит. Не пытаемся и не считаем это ошибкой.
    if (row.marketplace === 'ozon' && !isOzonReviewAnswerable(row.raw)) {
      await db.execute(sql`
        update reviews
        set status = 'skipped', last_error = ${OZON_EMPTY_REVIEW_NOTE}, updated_at = ${now}
        where id = ${row.id}
      `)
      summary.skipped += 1
      continue
    }

    let result: SendResult

    if (row.marketplace === 'wb') {
      result = credentials.wbToken
        ? await answerWbReview(credentials.wbToken, row.external_id, row.answer_text)
        : { ok: false, error: 'Токен Wildberries не задан в разделе «Подключения»' }
    } else if (row.marketplace === 'ozon') {
      result = credentials.ozon
        ? await answerOzonReview(credentials.ozon, row.external_id, row.answer_text, config.ozonMarkProcessed)
        : { ok: false, error: 'Ключи Ozon не заданы в разделе «Подключения»' }
    } else {
      result = { ok: false, error: `Неизвестная площадка: ${row.marketplace}` }
    }

    if (result.ok) {
      await db.execute(sql`
        update reviews
        set status = 'sent', sent_at = ${now}, last_error = null, updated_at = ${now}
        where id = ${row.id}
      `)
      summary.sent += 1
    } else if (result.notAnswerable) {
      // Повторять нечего: убираем отзыв из работы с понятным пояснением.
      await db.execute(sql`
        update reviews
        set status = 'skipped', last_error = ${result.error}, updated_at = ${now}
        where id = ${row.id}
      `)
      summary.skipped += 1
    } else {
      await db.execute(sql`
        update reviews
        set status = 'failed', last_error = ${result.error}, updated_at = ${now}
        where id = ${row.id}
      `)
      summary.failed += 1
      summary.errors.push(result.error)
    }

    await db.insert(auditLog).values({
      action: result.ok ? 'answer.sent' : result.notAnswerable ? 'answer.not_answerable' : 'answer.failed',
      reviewId: row.id,
      meta: {
        marketplace: row.marketplace,
        source: row.answer_source,
        error: result.ok ? null : result.error,
      },
    })
  }

  return summary
}
