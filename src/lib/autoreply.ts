import type { Settings } from '@/db/schema'

export type AutoReplyCandidate = {
  marketplace: string
  rating: number | null
  aiDraft: string | null
}

export type AutoReplyDecision =
  | { auto: true; sendAfter: Date; answerText: string }
  | { auto: false; reason: string }

/**
 * Решает, уходит ли отзыв в автоответ без аппрува.
 * Правило намеренно консервативное: без черновика ИИ и без оценки в белом списке
 * отзыв всегда остаётся оператору.
 */
export function decideAutoReply(
  candidate: AutoReplyCandidate,
  config: Settings,
  now = new Date(),
): AutoReplyDecision {
  if (!config.autoReplyEnabled) return { auto: false, reason: 'автоответ выключен' }

  if (!config.autoReplyMarketplaces.includes(candidate.marketplace)) {
    return { auto: false, reason: `автоответ выключен для ${candidate.marketplace}` }
  }

  const draft = candidate.aiDraft?.trim()
  if (!draft) return { auto: false, reason: 'нет черновика ИИ' }

  if (candidate.rating == null || !config.autoReplyRatings.includes(candidate.rating)) {
    return { auto: false, reason: 'оценка вне белого списка' }
  }

  return {
    auto: true,
    answerText: draft,
    sendAfter: new Date(now.getTime() + config.autoReplyDelayMinutes * 60_000),
  }
}
