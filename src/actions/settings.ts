'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, settings } from '@/db/schema'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { syncAll } from '@/lib/sync'
import type { FormState } from './auth'

const settingsSchema = z.object({
  autoReplyEnabled: z.boolean(),
  ozonMarkProcessed: z.boolean(),
  aiPrompt: z.string().trim().min(20, 'Промпт слишком короткий').max(8000, 'Промпт длиннее 8000 символов'),
  aiModel: z.string().trim().min(1, 'Укажите модель').max(100),
})

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole('admin')
  await getSettings()

  const parsed = settingsSchema.safeParse({
    autoReplyEnabled: formData.get('autoReplyEnabled') === 'on',
    ozonMarkProcessed: formData.get('ozonMarkProcessed') === 'on',
    aiPrompt: formData.get('aiPrompt'),
    aiModel: formData.get('aiModel'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте настройки' }
  }

  await db
    .update(settings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(settings.id, 1))

  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'settings.updated',
    meta: { autoReplyEnabled: parsed.data.autoReplyEnabled, aiModel: parsed.data.aiModel },
  })

  revalidatePath('/settings')
  revalidatePath('/reviews')
  return { ok: true }
}

/** Ручной запуск выгрузки, чтобы не ждать расписания n8n. */
export async function runSyncAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requireRole('admin')

  const results = await syncAll()
  const failed = results.filter((result) => !result.ok || result.error)

  revalidatePath('/reviews')

  if (failed.length > 0) {
    return { error: failed.map((result) => `${result.marketplace}: ${result.error}`).join('; ') }
  }

  const total = results.reduce((sum, result) => sum + result.created, 0)
  return { ok: true, message: `Готово. Новых отзывов: ${total}` }
}
