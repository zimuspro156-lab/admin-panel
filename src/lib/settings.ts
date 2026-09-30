import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { settings, type Settings } from '@/db/schema'

/** Возвращает настройки, создавая строку по умолчанию при первом обращении. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  if (row) return row

  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning()
  if (created) return created

  const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1)
  return existing
}
