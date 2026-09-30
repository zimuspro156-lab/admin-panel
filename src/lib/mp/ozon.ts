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

/** Текст для карточки: почему на этот отзыв нельзя ответить. */
export const OZON_EMPTY_REVIEW_NOTE =
  'Ozon не принимает ответы на отзывы без текста, фото и видео - только с оценкой'

/**
 * Ozon отклоняет комментарий к отзыву без содержимого:
 * createComment: cannot comment on empty review. Проверяем заранее, чтобы
 * не тратить запрос к OpenAI и не показывать оператору ошибку там, где
 * сделать ничего нельзя.
 */
export function isOzonReviewAnswerable(raw: unknown): boolean {
  const review = (raw ?? {}) as { text?: string; photos_amount?: number; videos_amount?: number }
  return (
    Boolean(review.text?.trim()) ||
    (review.photos_amount ?? 0) > 0 ||
    (review.videos_amount ?? 0) > 0
  )
}

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

const PAGE_SIZE = 100

/**
 * POST /v1/review/list - все необработанные отзывы. Лимит страницы по
 * документации Ozon от 20 до 100, дальше идём по курсору last_id, пока
 * маркетплейс отдаёт has_next.
 */
export async function fetchOzonReviews(
  credentials: OzonCredentials,
  maxPages = 20,
): Promise<FetchResult> {
  const collected: NormalizedReview[] = []
  let lastId = ''

  for (let page = 0; page < maxPages; page += 1) {
    const { ok, status, body } = await requestJson(`${BASE}/v1/review/list`, {
      method: 'POST',
      headers: headers(credentials),
      body: JSON.stringify({
        limit: PAGE_SIZE,
        sort_dir: 'DESC',
        status: 'UNPROCESSED',
        ...(lastId ? { last_id: lastId } : {}),
      }),
    })

    if (!ok) return { ok: false, error: describeError('Ozon', status, body) + subscriptionHint(status) }

    const payload = body as { reviews?: OzonReview[]; has_next?: boolean; last_id?: string }
    collected.push(...(payload?.reviews ?? []).map(normalize))

    if (!payload?.has_next || !payload?.last_id) break
    lastId = payload.last_id
  }

  return { ok: true, reviews: collected }
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

  if (!ok) {
    // Точное правило Ozon про «пустой» отзыв со временем меняется, поэтому
    // опираемся на его собственный отказ, а не только на предварительную
    // проверку: такой отзыв больше не пойдёт в отправку.
    const message = JSON.stringify(body ?? {})
    if (/cannot comment on empty review/i.test(message)) {
      return { ok: false, error: OZON_EMPTY_REVIEW_NOTE, notAnswerable: true }
    }
    return { ok: false, error: describeError('Ozon', status, body) + subscriptionHint(status) }
  }

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
