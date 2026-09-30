import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { integrations, settings, type Settings } from '@/db/schema'
import { decryptSecret } from './crypto'
import { DEFAULT_PROMPT } from './ai'

/** Возвращает настройки, создавая строку по умолчанию при первом обращении. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  if (row) return row

  await db.insert(settings).values({ id: 1, aiPrompt: DEFAULT_PROMPT }).onConflictDoNothing()
  const [created] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  return created
}

export type ResolvedIntegrations = {
  wbToken: string | null
  ozon: { clientId: string; apiKey: string } | null
  openaiApiKey: string | null
}

/**
 * Расшифрованные доступы для серверного кода. Ничего из возвращаемого
 * не должно попадать в ответы ручек и в разметку страниц.
 */
export async function getIntegrations(): Promise<ResolvedIntegrations> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, 1)).limit(1)
  if (!row) {
    await db.insert(integrations).values({ id: 1 }).onConflictDoNothing()
    return { wbToken: null, ozon: null, openaiApiKey: null }
  }

  const read = (value: string | null) => {
    if (!value) return null
    try {
      return decryptSecret(value)
    } catch (error) {
      // Сменился ENCRYPTION_KEY: доступ нужно ввести заново, но падать нельзя.
      console.error('[integrations] не удалось расшифровать значение', error)
      return null
    }
  }

  const clientId = read(row.ozonClientId)
  const apiKey = read(row.ozonApiKey)

  return {
    wbToken: read(row.wbToken),
    ozon: clientId && apiKey ? { clientId, apiKey } : null,
    openaiApiKey: read(row.openaiApiKey),
  }
}

/** Что заполнено, для интерфейса. Значения не раскрываются. */
export async function getIntegrationsStatus() {
  const resolved = await getIntegrations()
  return {
    wb: Boolean(resolved.wbToken),
    ozon: Boolean(resolved.ozon),
    openai: Boolean(resolved.openaiApiKey),
    wbTail: resolved.wbToken ? resolved.wbToken.slice(-6) : null,
    ozonClientId: resolved.ozon?.clientId ?? null,
    openaiTail: resolved.openaiApiKey ? resolved.openaiApiKey.slice(-4) : null,
  }
}
