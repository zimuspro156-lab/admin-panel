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

/**
 * Ключи и токены - это всегда одна непрерывная строка. Переносы и пробелы
 * попадают в них при копировании из кабинета, а маркетплейс потом отвечает
 * голым 401, по которому причину не угадать. Чистим на входе.
 */
const credential = (max: number, label: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, '').replace(/^Bearer/i, ''))
    .pipe(
      z
        .string()
        .max(max)
        // Заголовки HTTP допускают только latin-1: кириллица в ключе уронила бы
        // запрос к маркетплейсу вместо понятного отказа.
        .refine((value) => /^[\x20-\x7e]*$/.test(value), {
          message: `${label}: в значении есть недопустимые символы. Похоже, скопирован не ключ, а текст`,
        }),
    )

/**
 * Адрес прокси. undici умеет только HTTP и HTTPS прокси - socks5 он не
 * поддерживает, поэтому схему проверяем сразу, а не ловим потом невнятный
 * сбой соединения на каждом запросе к маркетплейсу.
 */
const proxyUrlField = z
  .string()
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (!value) return

    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Прокси: нужен полный адрес, например http://логин:пароль@11.22.33.44:8080',
      })
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        message: `Прокси: схема ${parsed.protocol} не поддерживается, нужен http:// или https:// (socks5 не умеем)`,
      })
      return
    }

    if (!parsed.hostname) {
      ctx.addIssue({ code: 'custom', message: 'Прокси: в адресе нет хоста' })
    }
  })

const schema = z.object({
  wbToken: credential(4000, 'Токен Wildberries'),
  ozonClientId: credential(100, 'Client-Id Ozon'),
  ozonApiKey: credential(500, 'Api-Key Ozon'),
  openaiApiKey: credential(500, 'Ключ OpenAI'),
  mpProxyUrl: proxyUrlField,
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
    mpProxyUrl: formData.get('mpProxyUrl') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте поля' }
  }

  const patch: Record<string, string | null> = {}
  const changed: string[] = []

  for (const [field, value] of Object.entries(parsed.data)) {
    if (!value) continue
    patch[field] = encryptSecret(value)
    changed.push(field)
  }

  // Пустое поле означает «не менять», поэтому выключение прокси - отдельный
  // флажок: иначе его нельзя было бы снять, только подменить другим адресом.
  if (formData.get('mpProxyClear')) {
    patch.mpProxyUrl = null
    changed.push('mpProxyUrl (снят)')
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
    const result = await checkWbToken(credentials.wbToken, credentials.mpProxyUrl)
    lines.push(result.ok ? `Wildberries: доступ есть, ${result.detail}` : `Wildberries: ${result.error}`)
  } else {
    lines.push('Wildberries: токен не задан')
  }

  if (credentials.ozon) {
    const result = await checkOzonCredentials(credentials.ozon, credentials.mpProxyUrl)
    lines.push(result.ok ? `Ozon: доступ есть, ${result.detail}` : `Ozon: ${result.error}`)
  } else {
    lines.push('Ozon: ключи не заданы')
  }

  lines.push(
    credentials.mpProxyUrl
      ? 'Прокси для маркетплейсов: используется, запросы к WB и Ozon шли через него'
      : 'Прокси для маркетплейсов: не задан, запросы шли напрямую',
  )

  if (credentials.openaiApiKey) {
    const result = await checkOpenAiKey(credentials.openaiApiKey, config.aiModel)
    lines.push(result.ok ? `OpenAI: доступ есть, ${result.detail}` : `OpenAI: ${result.error}`)
  } else {
    lines.push('OpenAI: ключ не задан')
  }

  return { ok: true, message: lines.join('\n') }
}
