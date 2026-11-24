import { ProxyAgent, fetch } from 'undici'

/** Общий вид отзыва, к которому приводятся обе площадки. */
export type NormalizedReview = {
  externalId: string
  /** Отзыв уже отвечен на маркетплейсе: в работу его брать не нужно. */
  alreadyAnswered?: boolean
  /** Текст ответа, если маркетплейс его отдаёт. */
  existingAnswer?: string | null
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
export type SendResult =
  | { ok: true; externalCommentId: string | null }
  /**
   * notAnswerable - маркетплейс не примет ответ на этот отзыв никогда,
   * повторять бессмысленно. Это не сбой отправки, а свойство отзыва.
   */
  | { ok: false; error: string; notAnswerable?: boolean }

/** Общий таймаут на запрос к маркетплейсу: воркфлоу не должен висеть вечно. */
export const REQUEST_TIMEOUT_MS = 20_000

/**
 * Диспетчеры кэшируем по адресу прокси: каждый держит пул соединений, и
 * создавать новый на каждый запрос - значит не переиспользовать ни одного.
 */
const dispatchers = new Map<string, ProxyAgent>()

function dispatcherFor(proxyUrl: string | null) {
  if (!proxyUrl) return undefined

  let agent = dispatchers.get(proxyUrl)
  if (!agent) {
    agent = new ProxyAgent(proxyUrl)
    dispatchers.set(proxyUrl, agent)
  }
  return agent
}

export async function requestJson(
  url: string,
  init: RequestInit & { proxyUrl?: string | null },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    let response: Response
    try {
      const { proxyUrl, ...rest } = init
      response = (await fetch(url, {
        ...rest,
        dispatcher: dispatcherFor(proxyUrl ?? null),
        signal: controller.signal,
      } as Parameters<typeof fetch>[1])) as unknown as Response
    } catch (cause) {
      // Сюда попадают сетевые сбои и непригодные заголовки (например, ключ,
      // сохранённый до появления проверки символов). Падать нельзя: ручку
      // зовёт n8n, и ей нужен понятный ответ.
      const message = cause instanceof Error ? cause.message : String(cause)
      const invalidHeader = /header/i.test(message)
      const detail = describeCause(cause)

      // Прокси отказал в авторизации - это не «сеть не работает», а неверные
      // логин или пароль, и чинится иначе.
      if (/407|proxy auth/i.test(detail)) {
        return {
          ok: false,
          status: 0,
          body: { message: 'прокси не принял логин и пароль (407). Проверьте их в разделе «Подключения»' },
        }
      }

      const viaProxy = init.proxyUrl
        ? ' Запрос шёл через прокси - проверьте его адрес, порт, логин и пароль.'
        : ''

      return {
        ok: false,
        status: 0,
        body: {
          message: invalidHeader
            ? 'не удалось отправить запрос: в ключе есть недопустимые символы, задайте его заново'
            : `не удалось соединиться: ${detail}.${viaProxy}`,
        },
      }
    }

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

/**
 * «fetch failed» ничего не объясняет: настоящая причина лежит глубоко в
 * цепочке cause - на три уровня ниже прячется и ECONNREFUSED, и отказ
 * прокси в авторизации. Собираем всю цепочку, иначе оператор видит
 * бессмысленное «Request was cancelled».
 */
function describeCause(cause: unknown): string {
  const seen: string[] = []
  let current: unknown = cause

  for (let level = 0; level < 5 && current instanceof Error; level += 1) {
    if (current.message && !seen.includes(current.message)) seen.push(current.message)
    current = current.cause
  }

  return seen.length > 0 ? seen.join(': ') : String(cause)
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
