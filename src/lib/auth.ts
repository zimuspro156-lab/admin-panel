import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users, type Role, type User } from '@/db/schema'
import { decrypt, readSessionCookie } from './session'

const BCRYPT_ROUNDS = 12

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function normalizeLogin(login: string) {
  return login.trim().toLowerCase()
}

/**
 * Текущий пользователь или null. Пользователя каждый раз читаем из базы:
 * так отключение или смена роли действуют сразу, а не после истечения куки.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await decrypt(await readSessionCookie())
  if (!session) return null

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  if (!user || !user.isActive) return null
  return user
})

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireRole(role: Role): Promise<User> {
  const user = await requireUser()
  if (user.role !== role) redirect('/reviews')
  return user
}

export function isAdmin(user: Pick<User, 'role'>) {
  return user.role === 'admin'
}

export async function countUsers() {
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  return rows.length
}
