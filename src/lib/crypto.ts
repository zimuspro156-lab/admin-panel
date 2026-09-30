import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function key() {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY не задан')

  const buffer = Buffer.from(raw, 'base64')
  if (buffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY должен быть 32 байта в base64 (openssl rand -base64 32)')
  }
  return buffer
}

/**
 * Токены маркетплейсов вводятся в панели, поэтому в базе они лежат
 * зашифрованными: дамп базы сам по себе не даёт доступа к кабинету продавца.
 * Формат: base64(iv | tag | ciphertext).
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

export function decryptSecret(payload: string): string {
  const buffer = Buffer.from(payload, 'base64')
  const iv = buffer.subarray(0, IV_LENGTH)
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** Для интерфейса: показываем только хвост, чтобы было видно, что ключ тот самый. */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return '••••'
  return `${'•'.repeat(8)}${plain.slice(-4)}`
}
