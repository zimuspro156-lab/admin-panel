'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { ROLES, auditLog, users } from '@/db/schema'
import { hashPassword, normalizeLogin, requireRole } from '@/lib/auth'
import type { FormState } from './auth'

const createUserSchema = z.object({
  login: z.string().trim().min(3, 'Логин короче 3 символов'),
  password: z.string().min(8, 'Пароль короче 8 символов'),
  role: z.enum(ROLES),
})

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole('admin')

  const parsed = createUserSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте поля' }
  }

  const login = normalizeLogin(parsed.data.login)
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.login, login)).limit(1)
  if (existing) return { error: `Логин ${login} уже занят` }

  const [created] = await db
    .insert(users)
    .values({
      login,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    })
    .returning({ id: users.id })

  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'user.created',
    meta: { targetUserId: created.id, login, role: parsed.data.role },
  })

  revalidatePath('/users')
  return { ok: true }
}

export async function toggleUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin')
  const userId = Number(formData.get('userId'))
  if (!Number.isInteger(userId)) return

  // Себя отключить нельзя: иначе панель останется без администратора.
  if (userId === admin.id) return

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return

  await db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, userId))
  await db.insert(auditLog).values({
    userId: admin.id,
    action: target.isActive ? 'user.disabled' : 'user.enabled',
    meta: { targetUserId: userId, login: target.login },
  })

  revalidatePath('/users')
}

const resetPasswordSchema = z.object({
  userId: z.coerce.number().int().positive(),
  password: z.string().min(8, 'Пароль короче 8 символов'),
})

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole('admin')

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте пароль' }
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, parsed.data.userId))

  await db.insert(auditLog).values({
    userId: admin.id,
    action: 'user.password_reset',
    meta: { targetUserId: parsed.data.userId },
  })

  revalidatePath('/users')
  return { ok: true }
}
