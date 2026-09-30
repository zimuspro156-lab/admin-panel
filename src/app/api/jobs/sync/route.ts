import { NextResponse } from 'next/server'
import { checkApiKey } from '@/lib/api-auth'
import { routeError } from '@/lib/route-error'
import { syncAll } from '@/lib/sync'

export const dynamic = 'force-dynamic'
// Выгрузка с двух площадок плюс генерация черновиков не укладывается в 10 секунд.
export const maxDuration = 300

/**
 * Полный прогон выгрузки: WB и Ozon, черновики ИИ, постановка в очередь
 * по правилу автоответа. Эту ручку дёргает n8n раз в час.
 */
async function handle(request: Request) {
  const auth = checkApiKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status })

  const results = await syncAll()
  const failed = results.filter((result) => !result.ok || result.error)

  return NextResponse.json({
    ok: failed.length === 0,
    results,
  })
}

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    return routeError('jobs/sync', error)
  }
}
