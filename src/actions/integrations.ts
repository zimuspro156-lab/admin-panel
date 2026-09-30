'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, integrations } from '@/db/schema'
import { checkOpenAiKey } from '@/lib/ai'
import { requireRole } from '@/lib/auth'
import { encryptSecret } from '@/lib/crypto'
import { checkOzonCredentials } from '@/lib/mp/ozon'
import { checkWbToken } from '@/lib/mp/wb'
import { getIntegrations, getSettings } from '@/lib/settings'
import type { FormState } from './auth'

const schema = z.object({
  wbToken: z.string().trim().max(4000),
  ozonClientId: z.string().trim().max(100),
  ozonApiKey: z.string().trim().max(500),
  openaiApiKey: z.string().trim().max(500),
})

/**
 * Сохранение доступов. Пустое поле означает «не менять»: так можно поправить
 * один ключ, не вводя заново остальные, и мы не показываем сохранённые
 * значения в разметке страницы.
 */
export async function updateIntegrationsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole('admin')
  await getIntegrations()

  const parsed = schema.safeParse({
    wbToken: formData.get('wbToken') ?? '',
    ozonClientId: formData.get('ozonClientId') ?? '',
    ozonApiKey: formData.get('ozonApiKey') ?? '',
    openaiApiKey: formData.get('openaiApiKey') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте поля' }
  }

  const patch: Record<string, string> = {}
  const changed: string[] = []

  for (const [field, value] of Object.entries(parsed.data)) {
    if (!value) continue
    patch[field] = encryptSecret(value)
    changed.push(field)
  }

  if (changed.length === 0) {
    return { error: 'Нечего сохранять: все поля пустые' }
  }

  await db
    .update(integrations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(integrations.id, 1))

  // В журнал пишем только имена полей, никогда значения.
  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'integrations.updated',
    meta: { fields: changed },
  })

  revalidatePath('/connections')
  return { ok: true, message: `Сохранено: ${changed.length}` }
}

/** Живая проверка доступов настоящим запросом к каждому сервису. */
export async function testConnectionsAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requireRole('admin')

  const [credentials, config] = await Promise.all([getIntegrations(), getSettings()])
  const lines: string[] = []

  if (credentials.wbToken) {
    const result = await checkWbToken(credentials.wbToken)
    lines.push(result.ok ? `Wildberries: доступ есть, ${result.detail}` : `Wildberries: ${result.error}`)
  } else {
    lines.push('Wildberries: токен не задан')
  }

  if (credentials.ozon) {
    const result = await checkOzonCredentials(credentials.ozon)
    lines.push(result.ok ? `Ozon: доступ есть, ${result.detail}` : `Ozon: ${result.error}`)
  } else {
    lines.push('Ozon: ключи не заданы')
  }

  if (credentials.openaiApiKey) {
    const result = await checkOpenAiKey(credentials.openaiApiKey, config.aiModel)
    lines.push(result.ok ? `OpenAI: доступ есть, ${result.detail}` : `OpenAI: ${result.error}`)
  } else {
    lines.push('OpenAI: ключ не задан')
  }

  return { ok: true, message: lines.join('\n') }
}
