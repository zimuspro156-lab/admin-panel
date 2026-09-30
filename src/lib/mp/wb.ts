import 'server-only'
import type { FetchResult, NormalizedReview, SendResult } from './types'
import { describeError, requestJson } from './types'

const BASE = process.env.WB_API_BASE || 'https://feedbacks-api.wildberries.ru'

type WbFeedback = {
  id?: string
  text?: string
  pros?: string
  cons?: string
  productValuation?: number
  createdDate?: string
  userName?: string
  photoLinks?: Array<{ fullSize?: string; miniSize?: string }> | null
  productDetails?: {
    nmId?: number
    productName?: string
    supplierArticle?: string | null
    brandName?: string | null
  }
}

function normalize(feedback: WbFeedback): NormalizedReview {
  const product = feedback.productDetails ?? {}
  const createdAt = feedback.createdDate ? new Date(feedback.createdDate) : null

  return {
    externalId: String(feedback.id),
    rating: feedback.productValuation ?? null,
    text: feedback.text || null,
    pros: feedback.pros || null,
    cons: feedback.cons || null,
    authorName: feedback.userName || null,
    productName: product.productName ?? null,
    productSku: product.nmId != null ? String(product.nmId) : null,
    productBrand: product.brandName ?? null,
    productArticle: product.supplierArticle ?? null,
    photos: (feedback.photoLinks ?? [])
      .map((photo) => photo?.fullSize || photo?.miniSize)
      .filter((url): url is string => Boolean(url)),
    mpCreatedAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    raw: feedback,
  }
}

const PAGE_SIZE = 100

/**
 * GET /api/v1/feedbacks - все неотвеченные отзывы, свежие сверху.
 * Листаем через skip, пока страница не окажется неполной: без этого при
 * очереди больше сотни каждый прогон тянул бы одну и ту же первую страницу,
 * а остальные отзывы не приезжали бы никогда.
 */
export async function fetchWbReviews(token: string, maxPages = 20): Promise<FetchResult> {
  const collected: NormalizedReview[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL('/api/v1/feedbacks', BASE)
    url.searchParams.set('isAnswered', 'false')
    url.searchParams.set('take', String(PAGE_SIZE))
    url.searchParams.set('skip', String(page * PAGE_SIZE))
    url.searchParams.set('order', 'dateDesc')

    const { ok, status, body } = await requestJson(url.toString(), {
      method: 'GET',
      headers: { Authorization: token },
    })

    if (!ok) return { ok: false, error: describeError('Wildberries', status, body) }

    const payload = body as { error?: boolean; errorText?: string; data?: { feedbacks?: WbFeedback[] } }
    if (payload?.error) {
      return { ok: false, error: `Wildberries: ${payload.errorText || 'ошибка API'}` }
    }

    const feedbacks = payload?.data?.feedbacks ?? []
    collected.push(...feedbacks.map(normalize))

    // Неполная страница означает, что дальше ничего нет.
    if (feedbacks.length < PAGE_SIZE) break
  }

  return { ok: true, reviews: collected }
}

/** POST /api/v1/feedbacks/answer - тело {id, text} по спецификации WB. */
export async function answerWbReview(
  token: string,
  externalId: string,
  text: string,
): Promise<SendResult> {
  const { ok, status, body } = await requestJson(`${BASE}/api/v1/feedbacks/answer`, {
    method: 'POST',
    headers: { Authorization: token, 'content-type': 'application/json' },
    body: JSON.stringify({ id: externalId, text }),
  })

  if (!ok) {
    // Токен с флагом «Только чтение» отбивается здесь, а не на выгрузке.
    const hint = status === 401 || status === 403 ? ' (проверьте, что у токена снят флаг «Только чтение»)' : ''
    return { ok: false, error: describeError('Wildberries', status, body) + hint }
  }

  const payload = body as { error?: boolean; errorText?: string } | null
  if (payload?.error) return { ok: false, error: `Wildberries: ${payload.errorText || 'ошибка API'}` }

  return { ok: true, externalCommentId: null }
}

/** Дешёвая проверка доступа: счётчик необработанных отзывов. */
export async function checkWbToken(token: string): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const { ok, status, body } = await requestJson(`${BASE}/api/v1/feedbacks/count-unanswered`, {
    method: 'GET',
    headers: { Authorization: token },
  })

  if (!ok) return { ok: false, error: describeError('Wildberries', status, body) }

  const payload = body as { data?: { countUnanswered?: number } }
  return { ok: true, detail: `неотвеченных отзывов: ${payload?.data?.countUnanswered ?? 0}` }
}
