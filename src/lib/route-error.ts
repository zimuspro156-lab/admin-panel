import 'server-only'
import { NextResponse } from 'next/server'

/**
 * Машинные ручки зовёт n8n, а не человек: любой сбой должен возвращаться
 * читаемым JSON, иначе в логе воркфлоу окажется пустой 500 без причины.
 */
export function routeError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${scope}]`, error)
  return NextResponse.json({ ok: false, error: message }, { status: 500 })
}
