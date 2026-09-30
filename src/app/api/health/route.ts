import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

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
    await db.execute(sql`select 1`)
  } catch (cause) {
    database = 'down'
    error = cause instanceof Error ? cause.message : String(cause)
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
