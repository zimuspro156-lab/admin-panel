import 'server-only'
import { requestJson } from './mp/types'

const ENDPOINT = `${process.env.OPENAI_API_BASE || 'https://api.openai.com'}/v1/chat/completions`

export const DEFAULT_PROMPT = [
  'Ты специалист поддержки продавца на маркетплейсе. Пишешь публичный ответ на отзыв покупателя.',
  'Правила:',
  '1. Пиши по-русски, на «вы», спокойно и по-человечески, без канцелярита.',
  '2. Длина 2-4 предложения, не больше 600 символов.',
  '3. Обращайся по имени, только если оно указано.',
  '4. При оценке 4-5 поблагодари и коротко подчеркни пользу товара.',
  '5. При оценке 1-3 признай проблему, извинись без оправданий и предложи решение: замену, возврат или обращение в поддержку продавца.',
  '6. Не обещай конкретных сроков, сумм и компенсаций. Не спорь с покупателем.',
  '7. Не упоминай, что ответ создан нейросетью. Не добавляй ссылки, телефоны и почту.',
  'В ответ верни только текст ответа покупателю, без кавычек и пояснений.',
].join('\n')

export type DraftInput = {
  rating: number | null
  text: string | null
  pros: string | null
  cons: string | null
  authorName: string | null
  productName: string | null
  productSku: string | null
}

function userPrompt(review: DraftInput) {
  return [
    `Товар: ${review.productName ?? (review.productSku ? `артикул ${review.productSku}` : 'не указан')}`,
    `Оценка: ${review.rating ?? 'нет'} из 5`,
    review.text ? `Отзыв: ${review.text}` : null,
    review.pros ? `Достоинства: ${review.pros}` : null,
    review.cons ? `Недостатки: ${review.cons}` : null,
    review.authorName ? `Имя покупателя: ${review.authorName}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export type DraftResult = { ok: true; draft: string; model: string } | { ok: false; error: string }

export async function generateDraft(
  apiKey: string,
  model: string,
  systemPrompt: string,
  review: DraftInput,
): Promise<DraftResult> {
  const { ok, status, body } = await requestJson(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt || DEFAULT_PROMPT },
        { role: 'user', content: userPrompt(review) },
      ],
    }),
  })

  if (!ok) {
    const record = (body ?? {}) as { error?: { message?: string } }
    return { ok: false, error: `OpenAI: HTTP ${status} ${record?.error?.message ?? ''}`.trim().slice(0, 500) }
  }

  const payload = body as { model?: string; choices?: Array<{ message?: { content?: string } }> }
  const content = payload?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, error: 'OpenAI вернул пустой ответ' }
  }

  return { ok: true, draft: content.trim(), model: payload?.model ?? model }
}

export async function checkOpenAiKey(
  apiKey: string,
  model: string,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const result = await generateDraft(apiKey, model, 'Ответь одним словом: ок', {
    rating: 5,
    text: 'проверка связи',
    pros: null,
    cons: null,
    authorName: null,
    productName: 'проверка',
    productSku: null,
  })

  return result.ok ? { ok: true, detail: `модель ответила: ${result.model}` } : result
}
