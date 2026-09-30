import 'server-only'
import type { FetchResult, NormalizedReview, SendResult } from './types'
import { describeError, requestJson } from './types'

const BASE = process.env.OZON_API_BASE || 'https://api-seller.ozon.ru'

type OzonReview = {
  id?: string
  rating?: number
  text?: string
  sku?: number
  published_at?: string
  status?: string
}

export type OzonCredentials = { clientId: string; apiKey: string }

function headers({ clientId, apiKey }: OzonCredentials) {
  return {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'content-type': 'application/json',
  }
}

function normalize(review: OzonReview): NormalizedReview {
  const createdAt = review.published_at ? new Date(review.published_at) : null

  return {
    externalId: String(review.id),
    rating: review.rating ?? null,
    text: review.text || null,
    // «Достоинства» и «Недостатки» Ozon в новых отзывах не отдаёт.
    pros: null,
    cons: null,
    authorName: null,
    productName: null,
    productSku: review.sku != null ? String(review.sku) : null,
    productBrand: null,
    productArticle: null,
    photos: [],
    mpCreatedAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    raw: review,
  }
}

/** Подписка «Управление отзывами» обязательна, без неё Ozon отбивает /v1/review/*. */
function subscriptionHint(status: number) {
  return status === 403 || status === 402
    ? ' (методы отзывов требуют подписки «Управление отзывами» / Premium Plus)'
    : ''
}

/** POST /v1/review/list - лимит от 20 до 100 по документации Ozon. */
export async function fetchOzonReviews(
  credentials: OzonCredentials,
  limit = 100,
): Promise<FetchResult> {
  const { ok, status, body } = await requestJson(`${BASE}/v1/review/list`, {
    method: 'POST',
    headers: headers(credentials),
    body: JSON.stringify({ limit: Math.min(100, Math.max(20, limit)), sort_dir: 'DESC', status: 'UNPROCESSED' }),
  })

  if (!ok) return { ok: false, error: describeError('Ozon', status, body) + subscriptionHint(status) }

  const payload = body as { reviews?: OzonReview[] }
  return { ok: true, reviews: (payload?.reviews ?? []).map(normalize) }
}

/** POST /v1/review/comment/create - публичный ответ продавца на отзыв. */
export async function answerOzonReview(
  credentials: OzonCredentials,
  externalId: string,
  text: string,
  markProcessed: boolean,
): Promise<SendResult> {
  const { ok, status, body } = await requestJson(`${BASE}/v1/review/comment/create`, {
    method: 'POST',
    headers: headers(credentials),
    body: JSON.stringify({
      review_id: externalId,
      text,
      mark_review_as_processed: markProcessed,
    }),
  })

  if (!ok) return { ok: false, error: describeError('Ozon', status, body) + subscriptionHint(status) }

  const payload = body as { comment_id?: string } | null
  return { ok: true, externalCommentId: payload?.comment_id ?? null }
}

/** POST /v1/review/count - самый дешёвый способ проверить ключи и подписку. */
export async function checkOzonCredentials(
  credentials: OzonCredentials,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const { ok, status, body } = await requestJson(`${BASE}/v1/review/count`, {
    method: 'POST',
    headers: headers(credentials),
    body: JSON.stringify({}),
  })

  if (!ok) return { ok: false, error: describeError('Ozon', status, body) + subscriptionHint(status) }

  const payload = body as { unprocessed?: number; total?: number }
  return { ok: true, detail: `необработанных отзывов: ${payload?.unprocessed ?? 0} из ${payload?.total ?? 0}` }
}
