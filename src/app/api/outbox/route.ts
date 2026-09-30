import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { checkApiKey } from '@/lib/api-auth'
import { routeError } from '@/lib/route-error'
import { outboxRequestSchema } from '@/lib/contracts'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

type LeasedRow = {
  id: number
  marketplace: string
  external_id: string
  answer_text: string
  answer_source: string | null
  attempts: number
}

/**
 * Забирает из очереди готовые ответы и переводит их в статус sending.
 * FOR UPDATE SKIP LOCKED нужен, чтобы два параллельных прогона n8n
 * не взяли один и тот же отзыв и не отправили ответ дважды.
 */
async function lease(limit: number, source: 'manual' | 'auto' | null, reviewId?: number) {
  if (limit <= 0) return []

  const rows = await db.execute<LeasedRow>(sql`
    update reviews as r
    set status = 'sending',
        attempts = r.attempts + 1,
        updated_at = now()
    where r.id in (
      select id from reviews
      where status = 'queued'
        and answer_text is not null
        and answer_text <> ''
        and (send_after is null or send_after <= now())
        ${reviewId ? sql`and id = ${reviewId}` : sql``}
        ${source ? sql`and answer_source = ${source}` : sql``}
      order by send_after asc nulls first, id asc
      for update skip locked
      limit ${limit}
    )
    returning r.id, r.marketplace, r.external_id, r.answer_text, r.answer_source, r.attempts
  `)

  return rows.rows
}

async function handle(request: Request) {
  const auth = checkApiKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const parsed = outboxRequestSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Некорректное тело запроса', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const limit = parsed.data.limit ?? 25
  const config = await getSettings()

  // Ручные ответы оператор уже подтвердил - их не throttl'им.
  const manual = await lease(limit, 'manual', parsed.data.reviewId)

  // Автоответы ограничены лимитом в час, чтобы не залить маркетплейс шаблонами.
  const sentLastHour = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from reviews
    where answer_source = 'auto'
      and sent_at is not null
      and sent_at > now() - interval '1 hour'
  `)
  const autoBudget = Math.max(0, config.autoReplyMaxPerHour - Number(sentLastHour.rows[0]?.count ?? 0))
  const auto = await lease(Math.min(limit - manual.length, autoBudget), 'auto', parsed.data.reviewId)

  const items = [...manual, ...auto].map((row) => ({
    id: row.id,
    marketplace: row.marketplace,
    externalId: row.external_id,
    answerText: row.answer_text,
    answerSource: row.answer_source,
    attempts: row.attempts,
    // Ozon умеет одним вызовом поставить комментарий и закрыть отзыв.
    ozonMarkProcessed: config.ozonMarkProcessed,
  }))

  return NextResponse.json({ ok: true, count: items.length, autoBudget, items })
}

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    return routeError('outbox', error)
  }
}
