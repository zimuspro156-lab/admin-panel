import { z } from 'zod'
import { MARKETPLACES } from '@/db/schema'

/** Дата от маркетплейса приходит строкой ISO; пустое значение допустимо. */
const mpDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  })

const nullableText = z.union([z.string(), z.null()]).optional().transform((v) => v ?? null)

export const incomingReviewSchema = z.object({
  externalId: z.string().min(1),
  rating: z.union([z.number().int().min(1).max(5), z.null()]).optional().transform((v) => v ?? null),
  text: nullableText,
  pros: nullableText,
  cons: nullableText,
  authorName: nullableText,
  productName: nullableText,
  productSku: nullableText,
  productBrand: nullableText,
  productArticle: nullableText,
  photos: z.array(z.string()).optional().transform((v) => v ?? []),
  mpCreatedAt: mpDate,
  aiDraft: nullableText,
  aiModel: nullableText,
  raw: z.unknown().optional(),
})

export const ingestSchema = z.object({
  marketplace: z.enum(MARKETPLACES),
  reviews: z.array(incomingReviewSchema).max(1000),
  /** Необязательная телеметрия прогона, попадает в журнал синхронизаций. */
  syncError: nullableText,
})

export const outboxRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  /** Если задан - забираем конкретный отзыв (сценарий немедленной отправки). */
  reviewId: z.number().int().positive().optional(),
})

export const outboxCallbackSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number().int().positive(),
        ok: z.boolean(),
        error: nullableText,
        externalCommentId: nullableText,
      }),
    )
    .min(1)
    .max(200),
})

export type IncomingReview = z.output<typeof incomingReviewSchema>
