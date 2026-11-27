/**
 * Поиск товара из отзыва в базе знаний.
 *
 * База знаний - свободный текст: продавец пишет её как хочет, никакого
 * справочника товаров в панели нет. Поэтому товар мы не «берём из базы», а
 * находим в ней: по артикулу, по SKU или по названию. Это даёт оператору
 * ответ на простой вопрос - знает ли ИИ что-нибудь именно про этот товар,
 * или ответит общими словами.
 */

export type KnowledgeMatch = {
  found: boolean
  /** Чем совпало. Артикул и SKU точные, название - приблизительное. */
  by: 'article' | 'sku' | 'name' | null
  /** Что нашлось в базе: оператору видно, на что обопрётся ИИ. */
  excerpt: string | null
}

export const NO_MATCH: KnowledgeMatch = { found: false, by: null, excerpt: null }

/** Границей слова считаем всё, кроме букв и цифр: артикулы бывают с дефисами. */
const WORD_CHAR = /[0-9a-zа-яё]/i

function containsToken(haystack: string, token: string): boolean {
  if (token.length < 2) return false

  const text = haystack.toLowerCase()
  const needle = token.toLowerCase()
  let from = 0

  for (;;) {
    const at = text.indexOf(needle, from)
    if (at === -1) return false

    const before = at === 0 ? '' : text[at - 1]
    const after = text[at + needle.length] ?? ''
    // Артикул DecBall10 не должен находиться внутри DecBall100.
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true

    from = at + 1
  }
}

/**
 * Значимые слова названия. Короткие отбрасываем: «шар 10 см» совпадёт с чем
 * угодно, а ложный флажок хуже отсутствующего - оператор перестанет ему верить.
 */
const MIN_WORD = 4

function significantWords(name: string): string[] {
  return [...new Set(
    name
      .toLowerCase()
      .split(/[^0-9a-zа-яё]+/i)
      .filter((word) => word.length >= MIN_WORD),
  )]
}

/** Кусок строки вокруг найденного, чтобы карточка не распухала. */
const EXCERPT_LIMIT = 160

function excerptAround(line: string, token: string): string {
  const trimmed = line.trim()
  if (trimmed.length <= EXCERPT_LIMIT) return trimmed

  const at = trimmed.toLowerCase().indexOf(token.toLowerCase())
  if (at === -1) return `${trimmed.slice(0, EXCERPT_LIMIT)}...`

  const from = Math.max(0, at - 40)
  const slice = trimmed.slice(from, from + EXCERPT_LIMIT)
  return `${from > 0 ? '...' : ''}${slice}${from + EXCERPT_LIMIT < trimmed.length ? '...' : ''}`
}

export type ProductRef = {
  productName: string | null
  productSku: string | null
  productArticle: string | null
}

export function matchKnowledge(knowledge: string, product: ProductRef): KnowledgeMatch {
  const text = knowledge.trim()
  if (!text) return NO_MATCH

  // Пустая строка разделяет абзацы, но искать удобнее построчно: так в
  // карточку попадает ровно та строка, где про товар и написано.
  const lines = text.split(/\r?\n/).filter((line) => line.trim())

  // Артикул и SKU - точные совпадения, им верим без оговорок.
  for (const [by, token] of [
    ['article', product.productArticle],
    ['sku', product.productSku],
  ] as const) {
    if (!token?.trim()) continue

    const line = lines.find((candidate) => containsToken(candidate, token.trim()))
    if (line) return { found: true, by, excerpt: excerptAround(line, token.trim()) }
  }

  // Название - приблизительно. Одного слова мало: «серебряный» встречается у
  // половины ассортимента. Требуем два, и только если их столько есть.
  const words = significantWords(product.productName ?? '')
  if (words.length === 0) return NO_MATCH

  const needed = Math.min(2, words.length)

  for (const line of lines) {
    const hit = words.filter((word) => containsToken(line, word))
    if (hit.length >= needed) {
      return { found: true, by: 'name', excerpt: excerptAround(line, hit[0]) }
    }
  }

  return NO_MATCH
}

/** Подпись для карточки: коротко, чем именно совпало. */
export function describeMatch(match: KnowledgeMatch): string {
  switch (match.by) {
    case 'article':
      return 'найден по артикулу'
    case 'sku':
      return 'найден по SKU'
    case 'name':
      return 'найден по названию'
    default:
      return 'нет в базе знаний'
  }
}
