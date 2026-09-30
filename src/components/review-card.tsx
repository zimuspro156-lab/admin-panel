'use client'

import { useActionState, useState } from 'react'
import {
  cancelAutoAnswerAction,
  retryAnswerAction,
  sendAnswerAction,
  skipReviewAction,
} from '@/actions/reviews'
import { MarketplaceBadge, StatusBadge, Stars } from './badges'

export type ReviewCardData = {
  id: number
  marketplace: string
  rating: number | null
  text: string | null
  pros: string | null
  cons: string | null
  authorName: string | null
  productName: string | null
  productSku: string | null
  productArticle: string | null
  photos: string[]
  status: string
  aiDraft: string | null
  answerText: string | null
  answerSource: string | null
  lastError: string | null
  createdAtLabel: string
  sentAtLabel: string | null
}

const EDITABLE_STATUSES = new Set(['new', 'failed', 'skipped', 'queued'])

export function ReviewCard({ review }: { review: ReviewCardData }) {
  const [text, setText] = useState(review.answerText ?? '')
  const [sendState, sendForm, sendPending] = useActionState(sendAnswerAction, {})
  const [draftState, draftForm, draftPending] = useActionState(sendAnswerAction, {})

  const editable = EDITABLE_STATUSES.has(review.status)
  const error = sendState.error ?? draftState.error

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MarketplaceBadge marketplace={review.marketplace} />
        <Stars rating={review.rating} />
        <span className="text-sm text-[var(--color-muted)]">{review.createdAtLabel}</span>
        {review.authorName ? (
          <span className="text-sm text-[var(--color-muted)]">· {review.authorName}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {review.answerSource === 'auto' ? (
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
              авто
            </span>
          ) : null}
          <StatusBadge status={review.status} />
        </span>
      </div>

      <p className="mt-3 text-sm font-medium">
        {review.productName ?? 'Товар не указан'}
        {review.productSku ? (
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            {review.marketplace === 'wb' ? 'nmId' : 'SKU'} {review.productSku}
          </span>
        ) : null}
        {review.productArticle ? (
          <span className="ml-2 font-normal text-[var(--color-muted)]">арт. {review.productArticle}</span>
        ) : null}
      </p>

      <div className="mt-2 space-y-1 text-sm whitespace-pre-line">
        {review.text ? <p>{review.text}</p> : null}
        {review.pros ? (
          <p>
            <span className="text-[var(--color-muted)]">Достоинства: </span>
            {review.pros}
          </p>
        ) : null}
        {review.cons ? (
          <p>
            <span className="text-[var(--color-muted)]">Недостатки: </span>
            {review.cons}
          </p>
        ) : null}
        {!review.text && !review.pros && !review.cons ? (
          <p className="text-[var(--color-muted)]">Отзыв без текста, только оценка.</p>
        ) : null}
      </div>

      {review.photos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.photos.slice(0, 6).map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener">
              {/* Домены CDN маркетплейсов меняются, поэтому обычный img без оптимизации. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Фото из отзыва"
                loading="lazy"
                className="h-16 w-16 rounded-lg border border-[var(--color-line)] object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}

      {review.status === 'sent' ? (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm">
          <p className="mb-1 text-xs font-medium tracking-wide text-emerald-700 uppercase">
            Ответ отправлен {review.sentAtLabel ? `· ${review.sentAtLabel}` : ''}
          </p>
          <p className="whitespace-pre-line text-emerald-900">{review.answerText}</p>
        </div>
      ) : null}

      {review.status === 'queued' || review.status === 'sending' ? (
        <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
          <p className="mb-1 text-xs font-medium tracking-wide text-blue-700 uppercase">
            {review.status === 'sending' ? 'Отправляется' : 'В очереди на отправку'}
          </p>
          <p className="whitespace-pre-line text-blue-900">{review.answerText}</p>
          {review.status === 'queued' && review.answerSource === 'auto' ? (
            <form action={cancelAutoAnswerAction} className="mt-2">
              <input type="hidden" name="reviewId" value={review.id} />
              <button type="submit" className="btn-ghost px-2 py-1 text-xs">
                Снять с автоотправки
              </button>
            </form>
          ) : null}
          {review.status === 'sending' ? (
            <form action={retryAnswerAction} className="mt-2">
              <input type="hidden" name="reviewId" value={review.id} />
              <button type="submit" className="btn-ghost px-2 py-1 text-xs">
                Вернуть в очередь
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {review.lastError && review.status === 'failed' ? (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <p className="text-xs font-medium tracking-wide uppercase">Ошибка отправки</p>
          <p className="mt-1">{review.lastError}</p>
        </div>
      ) : null}

      {editable ? (
        <div className="mt-4 space-y-3">
          {review.aiDraft ? (
            <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
              <p className="mb-1 text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
                Черновик ИИ
              </p>
              <p className="text-sm whitespace-pre-line">{review.aiDraft}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setText(review.aiDraft ?? '')}
                >
                  Заполнить
                </button>

                <form action={draftForm}>
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="text" value={review.aiDraft} />
                  <button type="submit" className="btn-primary text-xs" disabled={draftPending}>
                    {draftPending ? 'Ставим...' : 'Поставить'}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Черновик ИИ ещё не пришёл из n8n. Ответ можно написать вручную.
            </p>
          )}

          <form action={sendForm} className="space-y-2">
            <input type="hidden" name="reviewId" value={review.id} />
            <textarea
              name="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Ответ покупателю"
              className="field resize-y"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary text-sm" disabled={sendPending || !text.trim()}>
                {sendPending ? 'Отправляем...' : 'Отправить ответ'}
              </button>

              {review.status === 'failed' ? (
                <button type="submit" formAction={retryAnswerAction} className="btn-ghost text-sm">
                  Повторить прежний ответ
                </button>
              ) : null}

              {review.status === 'new' || review.status === 'failed' ? (
                <button type="submit" formAction={skipReviewAction} className="btn-ghost text-sm">
                  Не отвечать
                </button>
              ) : null}

              <span className="text-xs text-[var(--color-muted)]">{text.length} / 5000</span>
            </div>
          </form>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
