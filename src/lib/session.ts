import 'server-only'
import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { SESSION_COOKIE } from './constants'

const COOKIE_NAME = SESSION_COOKIE
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type SessionPayload = { userId: number }

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET не задан или короче 32 символов')
  }
  return new TextEncoder().encode(value)
}

export async function encrypt(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret())
}

export async function decrypt(token?: string): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    const userId = Number(payload.userId)
    return Number.isInteger(userId) ? { userId } : null
  } catch {
    // Просроченная или подделанная кука - это просто «не авторизован».
    return null
  }
}

/**
 * Ставить ли флаг Secure. Ориентируемся на протокол запроса, а не на режим
 * сборки: по HTTP браузер Secure-куку просто отбросит, и вход будет молча
 * не работать. Как только панель встанет за HTTPS, флаг появится сам.
 */
async function useSecureCookie() {
  const forwarded = (await headers()).get('x-forwarded-proto') ?? ''
  // Прокси могут добавлять свой протокол через запятую, нужен самый первый.
  return forwarded.split(',')[0].trim().toLowerCase() === 'https'
}

export async function createSession(userId: number) {
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000)
  const token = await encrypt({ userId }, expiresAt)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: await useSecureCookie(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function readSessionCookie() {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value
}

export async function deleteSession() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export { COOKIE_NAME }
