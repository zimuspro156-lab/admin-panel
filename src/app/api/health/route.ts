import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/db'
import { settings } from '@/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Драйвер оборачивает ошибку Postgres, и в верхнем сообщении остаётся только
 * текст запроса. Разворачиваем цепочку причин, чтобы назвать настоящую:
 * чаще всего это недокатанные миграции, а не поломка базы.
 */
function describeDbFailure(cause: unknown): string {
  const chain: string[] = []
  let current: unknown = cause

  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    chain.push(current.message)
    current = (current as { cause?: unknown }).cause
  }

  const full = chain.join(' | ') || String(cause)
  const missing = /(column|relation) "?([\w.]+)"? does not exist/i.exec(full)

  return missing
    ? `схема базы отстала от кода: нет ${missing[1] === 'column' ? 'колонки' : 'таблицы'} ${missing[2]}. Накатите миграции: bash deploy/update.sh`
    : full.slice(0, 400)
}

/**
 * Проверка живости и диагностика подключения за обратным прокси.
 * Секретов не раскрывает: только протокол, который сообщил прокси, и
 * вычисленный из него флаг Secure - самая частая причина «вход не держится».
 */
export async function GET() {
  const incoming = await headers()
  const forwardedProto = incoming.get('x-forwarded-proto')
  const cookieSecure = (forwardedProto ?? '').split(',')[0].trim().toLowerCase() === 'https'

  let database = 'up'
  let error: string | null = null
  try {
    // Не просто `select 1`: читаем настройки, то есть проверяем, что схема
    // соответствует коду. Иначе ручка отвечала бы «здоров», когда миграции
    // отстали, а каждая страница при этом падает.
    await db.select().from(settings).limit(1)
  } catch (cause) {
    database = 'down'
    error = describeDbFailure(cause)
  }

  return NextResponse.json(
    {
      ok: database === 'up',
      db: database,
      error,
      request: {
        // null означает, что прокси не передал заголовок.
        forwardedProto,
        forwardedHost: incoming.get('x-forwarded-host'),
        host: incoming.get('host'),
        // Если true, а открываете вы панель по http, браузер выбросит куку сессии.
        cookieSecure,
      },
    },
    { status: database === 'up' ? 200 : 503 },
  )
}
