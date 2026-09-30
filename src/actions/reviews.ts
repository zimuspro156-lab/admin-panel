'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, reviews } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import { dispatchQueue } from '@/lib/dispatch'
import type { FormState } from './auth'

const answerSchema = z.object({
  reviewId: z.coerce.number().int().positive(),
  text: z.string().trim().min(1, 'Ответ пустой').max(5000, 'Ответ длиннее 5000 символов'),
})

/**
 * «Поставить» и «Отправить ответ»: сохраняем текст, ставим в очередь и тут же
 * отправляем. Оператор сразу видит исход, а не «ушло куда-то в очередь».
 */
export async function sendAnswerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()

  const parsed = answerSchema.safeParse({
    reviewId: formData.get('reviewId'),
    text: formData.get('text'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте текст ответа' }
  }

  const { reviewId, text } = parsed.data

  const updated = await db
    .update(reviews)
    .set({
      answerText: text,
      answerSource: 'manual',
      answeredByUserId: user.id,
      status: 'queued',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, reviewId), inArray(reviews.status, ['new', 'failed', 'skipped', 'queued'])))
    .returning({ id: reviews.id })

  if (updated.length === 0) {
    return { error: 'Этот отзыв уже отправляется или отвечен' }
  }

  await db.insert(auditLog).values({
    userId: user.id,
    action: 'answer.queued',
    reviewId,
    meta: { length: text.length },
  })

  const summary = await dispatchQueue({ reviewId, limit: 1 })
  revalidatePath('/reviews')

  if (summary.failed > 0) {
    return { error: summary.errors[0] ?? 'Маркетплейс не принял ответ' }
  }
  return { ok: true }
}

const reviewIdSchema = z.coerce.number().int().positive()

/** «Не отвечать»: убирает отзыв из рабочей очереди, не трогая маркетплейс. */
export async function skipReviewAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = reviewIdSchema.safeParse(formData.get('reviewId'))
  if (!parsed.success) return

  await db
    .update(reviews)
    .set({ status: 'skipped', updatedAt: new Date() })
    .where(and(eq(reviews.id, parsed.data), inArray(reviews.status, ['new', 'failed'])))

  await db.insert(auditLog).values({ userId: user.id, action: 'review.skipped', reviewId: parsed.data })
  revalidatePath('/reviews')
}

/** Повтор отправки для упавшего или зависшего отзыва. */
export async function retryAnswerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = reviewIdSchema.safeParse(formData.get('reviewId'))
  if (!parsed.success) return

  const updated = await db
    .update(reviews)
    .set({ status: 'queued', lastError: null, updatedAt: new Date() })
    .where(and(eq(reviews.id, parsed.data), inArray(reviews.status, ['failed', 'sending'])))
    .returning({ id: reviews.id })

  if (updated.length === 0) return

  await db.insert(auditLog).values({ userId: user.id, action: 'answer.retry', reviewId: parsed.data })
  await dispatchQueue({ reviewId: parsed.data, limit: 1 })
  revalidatePath('/reviews')
}

/** Снимает автоответ с очереди, пока он ещё не ушёл. */
export async function cancelAutoAnswerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = reviewIdSchema.safeParse(formData.get('reviewId'))
  if (!parsed.success) return

  const updated = await db
    .update(reviews)
    .set({ status: 'new', answerText: null, answerSource: null, updatedAt: new Date() })
    .where(and(eq(reviews.id, parsed.data), eq(reviews.status, 'queued'), eq(reviews.answerSource, 'auto')))
    .returning({ id: reviews.id })

  if (updated.length === 0) return

  await db.insert(auditLog).values({
    userId: user.id,
    action: 'autoreply.cancelled',
    reviewId: parsed.data,
  })
  revalidatePath('/reviews')
}
