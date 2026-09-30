'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { MARKETPLACES, auditLog, settings } from '@/db/schema'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import type { FormState } from './auth'

const settingsSchema = z.object({
  autoReplyEnabled: z.boolean(),
  autoReplyRatings: z.array(z.number().int().min(1).max(5)),
  autoReplyMarketplaces: z.array(z.enum(MARKETPLACES)),
  autoReplyDelayMinutes: z.coerce.number().int().min(0).max(1440),
  autoReplyMaxPerHour: z.coerce.number().int().min(1).max(1000),
  ozonMarkProcessed: z.boolean(),
  n8nSendWebhookUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https?:\/\//.test(value), 'Нужен URL, начинающийся с http(s)://'),
})

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole('admin')
  await getSettings() // гарантирует, что строка настроек существует

  const parsed = settingsSchema.safeParse({
    autoReplyEnabled: formData.get('autoReplyEnabled') === 'on',
    autoReplyRatings: formData.getAll('autoReplyRatings').map(Number),
    autoReplyMarketplaces: formData.getAll('autoReplyMarketplaces').map(String),
    autoReplyDelayMinutes: formData.get('autoReplyDelayMinutes'),
    autoReplyMaxPerHour: formData.get('autoReplyMaxPerHour'),
    ozonMarkProcessed: formData.get('ozonMarkProcessed') === 'on',
    n8nSendWebhookUrl: formData.get('n8nSendWebhookUrl') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте настройки' }
  }

  const data = parsed.data
  if (data.autoReplyEnabled && data.autoReplyRatings.length === 0) {
    return { error: 'Выберите хотя бы одну оценку для автоответа' }
  }
  if (data.autoReplyEnabled && data.autoReplyMarketplaces.length === 0) {
    return { error: 'Выберите хотя бы один маркетплейс для автоответа' }
  }

  await db
    .update(settings)
    .set({
      autoReplyEnabled: data.autoReplyEnabled,
      autoReplyRatings: data.autoReplyRatings.sort((a, b) => b - a),
      autoReplyMarketplaces: data.autoReplyMarketplaces,
      autoReplyDelayMinutes: data.autoReplyDelayMinutes,
      autoReplyMaxPerHour: data.autoReplyMaxPerHour,
      ozonMarkProcessed: data.ozonMarkProcessed,
      n8nSendWebhookUrl: data.n8nSendWebhookUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1))

  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'settings.updated',
    meta: { autoReplyEnabled: data.autoReplyEnabled, ratings: data.autoReplyRatings },
  })

  revalidatePath('/settings')
  revalidatePath('/reviews')
  return { ok: true }
}
