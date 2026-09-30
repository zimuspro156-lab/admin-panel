import 'server-only'
import { timingSafeEqual } from 'node:crypto'

/**
 * Машинные ручки (их зовёт n8n) авторизуются общим ключом в заголовке.
 * Сравнение постоянное по времени, чтобы ключ нельзя было подобрать побайтово.
 */
export function checkApiKey(request: Request): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.N8N_API_KEY
  if (!expected) {
    return { ok: false, status: 500, message: 'N8N_API_KEY не задан на сервере' }
  }

  const provided = request.headers.get('x-api-key') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: 'Неверный x-api-key' }
  }
  return { ok: true }
}
