import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, reviews, syncRuns } from '@/db/schema'
import { checkApiKey } from '@/lib/api-auth'
import { routeError } from '@/lib/route-error'
import { decideAutoReply } from '@/lib/autoreply'
import { ingestSchema } from '@/lib/contracts'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Приёмник отзывов из n8n. Идемпотентен по паре (маркетплейс, id отзыва):
 * повторный прогон обновляет текст и черновик, но никогда не откатывает статус
 * уже отправленного или подтверждённого ответа.
 */
async function handle(request: Request) {
  const auth = checkApiKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status })

  const parsed = ingestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Некорректное тело запроса', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const { marketplace, reviews: incoming, syncError } = parsed.data
  const config = await getSettings()
  const now = new Date()

  let created = 0
  let updated = 0
  let queued = 0

  if (incoming.length > 0) {
    const externalIds = incoming.map((r) => r.externalId)
    const existing = await db
      .select({ externalId: reviews.externalId, status: reviews.status, aiDraft: reviews.aiDraft })
      .from(reviews)
      .where(and(eq(reviews.marketplace, marketplace), inArray(reviews.externalId, externalIds)))

    const existingByExternalId = new Map(existing.map((row) => [row.externalId, row]))

    for (const item of incoming) {
      const known = existingByExternalId.get(item.externalId)

      const content = {
        rating: item.rating,
        text: item.text,
        pros: item.pros,
        cons: item.cons,
        authorName: item.authorName,
        productName: item.productName,
        productSku: item.productSku,
        productBrand: item.productBrand,
        productArticle: item.productArticle,
        photos: item.photos,
        mpCreatedAt: item.mpCreatedAt,
        raw: item.raw ?? null,
        updatedAt: now,
      }

      if (!known) {
        const decision = decideAutoReply(
          { marketplace, rating: item.rating, aiDraft: item.aiDraft },
          config,
          now,
        )

        await db.insert(reviews).values({
          marketplace,
          externalId: item.externalId,
          ...content,
          aiDraft: item.aiDraft,
          aiModel: item.aiModel,
          aiGeneratedAt: item.aiDraft ? now : null,
          ...(decision.auto
            ? {
                status: 'queued' as const,
                answerText: decision.answerText,
                answerSource: 'auto' as const,
                sendAfter: decision.sendAfter,
              }
            : { status: 'new' as const }),
        })

        created += 1
        if (decision.auto) queued += 1
        continue
      }

      // Отзыв уже знаком. Черновик обновляем только пока им никто не занялся.
      const draftUpdate =
        known.status === 'new' && item.aiDraft
          ? { aiDraft: item.aiDraft, aiModel: item.aiModel, aiGeneratedAt: now }
          : {}

      await db
        .update(reviews)
        .set({ ...content, ...draftUpdate })
        .where(and(eq(reviews.marketplace, marketplace), eq(reviews.externalId, item.externalId)))

      updated += 1
    }
  }

  await db.insert(syncRuns).values({
    marketplace,
    fetched: incoming.length,
    created,
    status: syncError ? 'error' : 'ok',
    error: syncError,
  })

  if (queued > 0) {
    await db.insert(auditLog).values({
      action: 'autoreply.queued',
      meta: { marketplace, count: queued },
    })
  }

  return NextResponse.json({ ok: true, received: incoming.length, created, updated, queued })
}

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    return routeError('ingest', error)
  }
}
