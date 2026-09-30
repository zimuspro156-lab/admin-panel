/** Общий вид отзыва, к которому приводятся обе площадки. */
export type NormalizedReview = {
  externalId: string
  rating: number | null
  text: string | null
  pros: string | null
  cons: string | null
  authorName: string | null
  productName: string | null
  productSku: string | null
  productBrand: string | null
  productArticle: string | null
  photos: string[]
  mpCreatedAt: Date | null
  raw: unknown
}

export type FetchResult = { ok: true; reviews: NormalizedReview[] } | { ok: false; error: string }
export type SendResult = { ok: true; externalCommentId: string | null } | { ok: false; error: string }

/** Общий таймаут на запрос к маркетплейсу: воркфлоу не должен висеть вечно. */
export const REQUEST_TIMEOUT_MS = 20_000

export async function requestJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const raw = await response.text()

    let body: unknown = null
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        // Некоторые ошибки прилетают текстом, а не JSON.
        body = { message: raw.slice(0, 500) }
      }
    }

    return { ok: response.ok, status: response.status, body }
  } finally {
    clearTimeout(timeout)
  }
}

export function describeError(prefix: string, status: number, body: unknown): string {
  const record = (body ?? {}) as Record<string, unknown>
  const detail =
    (typeof record.errorText === 'string' && record.errorText) ||
    (typeof record.message === 'string' && record.message) ||
    (typeof record.error === 'string' && record.error) ||
    ''
  return `${prefix}: HTTP ${status}${detail ? ` ${detail}` : ''}`.slice(0, 500)
}
