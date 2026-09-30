import type { Settings } from '@/db/schema'

export type AutoReplyDecision = { auto: true; answerText: string } | { auto: false; reason: string }

/**
 * Автоответ - один переключатель: включён, значит черновик ИИ уходит сам.
 * Единственное жёсткое условие - черновик должен существовать: без него
 * отправлять нечего, и отзыв остаётся оператору.
 */
export function decideAutoReply(aiDraft: string | null, config: Settings): AutoReplyDecision {
  if (!config.autoReplyEnabled) return { auto: false, reason: 'автоответ выключен' }

  const draft = aiDraft?.trim()
  if (!draft) return { auto: false, reason: 'нет черновика ИИ' }

  return { auto: true, answerText: draft }
}
