import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkApiKey } from '@/lib/api-auth'
import { dispatchQueue } from '@/lib/dispatch'
import { routeError } from '@/lib/route-error'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  reviewId: z.number().int().positive().optional(),
})

/**
 * Отправляет накопившуюся очередь ответов на маркетплейсы.
 * Страховка на случай, если немедленная отправка при нажатии «Поставить»
 * не прошла, и основной путь для автоответов.
 */
async function handle(request: Request) {
  const auth = checkApiKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status })

  const parsed = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Некорректное тело запроса', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const summary = await dispatchQueue(parsed.data)
  return NextResponse.json({ ok: summary.failed === 0, ...summary })
}

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    return routeError('jobs/flush', error)
  }
}
