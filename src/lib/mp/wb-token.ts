import 'server-only'

export type TokenInsight = {
  /** Похоже ли значение на токен WB (три части через точку, как у JWT). */
  looksLikeToken: boolean
  length: number
  expiresAt: Date | null
  expired: boolean
  /**
   * В поле прав токена WB старший бит отвечает за режим «Только чтение».
   * Признак вспомогательный: окончательный ответ даёт сама отправка ответа.
   */
  readOnlyLikely: boolean
}

function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const READ_ONLY_BIT = 1 << 30

/** Разбирает токен, ничего не раскрывая: наружу идут только выводы, не содержимое. */
export function inspectWbToken(token: string): TokenInsight {
  const payload = decodePayload(token)
  const exp = typeof payload?.exp === 'number' ? new Date(payload.exp * 1000) : null
  const scope = typeof payload?.s === 'number' ? payload.s : null

  return {
    looksLikeToken: payload !== null,
    length: token.length,
    expiresAt: exp,
    expired: exp !== null && exp.getTime() < Date.now(),
    readOnlyLikely: scope !== null && (scope & READ_ONLY_BIT) !== 0,
  }
}

/** Человеческое объяснение, почему токен может не работать. */
export function describeWbToken(token: string): string {
  const insight = inspectWbToken(token)
  const notes: string[] = []

  if (!insight.looksLikeToken) {
    notes.push(
      `значение не похоже на токен WB (длина ${insight.length}) - возможно, скопирован не полностью или не из того поля`,
    )
    return notes.join('; ')
  }

  if (insight.expired && insight.expiresAt) {
    notes.push(`токен истёк ${insight.expiresAt.toLocaleDateString('ru-RU')} - нужен новый`)
  } else if (insight.expiresAt) {
    notes.push(`действует до ${insight.expiresAt.toLocaleDateString('ru-RU')}`)
  }

  if (insight.readOnlyLikely) {
    notes.push('похоже, у токена стоит флаг «Только чтение» - выгрузка пойдёт, отправка ответов нет')
  }

  notes.push(`длина ${insight.length}`)
  return notes.join('; ')
}
