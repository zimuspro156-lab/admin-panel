import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, reviews } from '@/db/schema'
import { checkApiKey } from '@/lib/api-auth'
import { routeError } from '@/lib/route-error'
import { outboxCallbackSchema } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

/** n8n сообщает исход отправки по каждому отзыву из партии. */
async function handle(request: Request) {
  const auth = checkApiKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status })

  const parsed = outboxCallbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Некорректное тело запроса', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const now = new Date()
  let sent = 0
  let failed = 0

  for (const result of parsed.data.results) {
    if (result.ok) {
      await db
        .update(reviews)
        .set({ status: 'sent', sentAt: now, lastError: null, updatedAt: now })
        .where(eq(reviews.id, result.id))
      sent += 1
    } else {
      await db
        .update(reviews)
        .set({
          status: 'failed',
          lastError: result.error ?? 'Маркетплейс не принял ответ',
          updatedAt: now,
        })
        .where(eq(reviews.id, result.id))
      failed += 1
    }

    await db.insert(auditLog).values({
      action: result.ok ? 'answer.sent' : 'answer.failed',
      reviewId: result.id,
      meta: { error: result.error ?? null, externalCommentId: result.externalCommentId ?? null },
    })
  }

  return NextResponse.json({ ok: true, sent, failed })
}

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    return routeError('outbox/callback', error)
  }
}
