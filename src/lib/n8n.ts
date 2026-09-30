import 'server-only'

/**
 * Пинает вебхук n8n, чтобы ответ ушёл сразу после нажатия «Поставить».
 * Это только ускорение: если вебхук не настроен или недоступен, отзыв всё равно
 * лежит в очереди со статусом queued и его подберёт воркфлоу отправки по расписанию.
 */
export async function pokeSendWebhook(url: string | null, reviewId: number): Promise<void> {
  if (!url) return

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.N8N_API_KEY ?? '',
      },
      body: JSON.stringify({ reviewId, trigger: 'manual' }),
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
  } catch (error) {
    console.error('[n8n] не удалось дёрнуть вебхук отправки', error)
  }
}
