'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { auditLog, users } from '@/db/schema'
import { countUsers, hashPassword, normalizeLogin, verifyPassword } from '@/lib/auth'
import { createSession, deleteSession } from '@/lib/session'

export type FormState = { error?: string; ok?: boolean; message?: string }

const credentialsSchema = z.object({
  login: z.string().trim().min(3, 'Логин короче 3 символов'),
  password: z.string().min(8, 'Пароль короче 8 символов'),
})

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте логин и пароль' }
  }

  const login = normalizeLogin(parsed.data.login)
  const [user] = await db.select().from(users).where(eq(users.login, login)).limit(1)

  // Одно и то же сообщение на «нет пользователя» и «неверный пароль»,
  // чтобы по ответу нельзя было перебрать существующие логины.
  const invalid: FormState = { error: 'Неверный логин или пароль' }

  if (!user || !user.isActive) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return invalid
  }

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return invalid
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
  await createSession(user.id)
  redirect('/reviews')
}

export async function logoutAction() {
  await deleteSession()
  redirect('/login')
}

/** Первичная установка: доступна только пока в базе нет ни одного пользователя. */
export async function setupAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if ((await countUsers()) > 0) {
    return { error: 'Администратор уже создан, войдите под своим логином' }
  }

  const parsed = credentialsSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Проверьте логин и пароль' }
  }

  const login = normalizeLogin(parsed.data.login)
  const [created] = await db
    .insert(users)
    .values({
      login,
      passwordHash: await hashPassword(parsed.data.password),
      role: 'admin',
    })
    .returning({ id: users.id })

  await db.insert(auditLog).values({ userId: created.id, action: 'setup.admin_created' })
  await createSession(created.id)
  redirect('/reviews')
}
