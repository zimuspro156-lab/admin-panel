'use client'

import { useActionState, useState } from 'react'
import { updateSettingsAction } from '@/actions/settings'
import type { Settings } from '@/db/schema'

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, {})
  const [autoEnabled, setAutoEnabled] = useState(settings.autoReplyEnabled)

  return (
    <form action={formAction} className="space-y-6">
      <section className="card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="autoReplyEnabled"
            defaultChecked={settings.autoReplyEnabled}
            onChange={(event) => setAutoEnabled(event.target.checked)}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Автоответ без аппрува</span>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">
              Черновик ИИ уходит на маркетплейс сам, если отзыв попадает под правила ниже. Остальное
              по-прежнему ждёт оператора.
            </span>
          </span>
        </label>
      </section>

      <section className="card space-y-4 p-4" aria-disabled={!autoEnabled}>
        <div>
          <span className="label">Оценки, на которые разрешён автоответ</span>
          <div className="flex flex-wrap gap-3">
            {[5, 4, 3, 2, 1].map((rating) => (
              <label key={rating} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="autoReplyRatings"
                  value={rating}
                  defaultChecked={settings.autoReplyRatings.includes(rating)}
                  disabled={!autoEnabled}
                  className="size-4"
                />
                {rating} ★
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Оценки 1-3 лучше оставлять на ручной ответ: это как раз те отзывы, где шаблон вредит.
          </p>
        </div>

        <div>
          <span className="label">Площадки, где работает автоответ</span>
          <div className="flex flex-wrap gap-3">
            {[
              { value: 'wb', label: 'Wildberries' },
              { value: 'ozon', label: 'Ozon' },
            ].map((mp) => (
              <label key={mp.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="autoReplyMarketplaces"
                  value={mp.value}
                  defaultChecked={settings.autoReplyMarketplaces.includes(mp.value)}
                  disabled={!autoEnabled}
                  className="size-4"
                />
                {mp.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="autoReplyDelayMinutes">
              Задержка перед автоотправкой, мин
            </label>
            <input
              id="autoReplyDelayMinutes"
              name="autoReplyDelayMinutes"
              type="number"
              min={0}
              max={1440}
              defaultValue={settings.autoReplyDelayMinutes}
              className="field"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Окно, в течение которого оператор ещё может снять ответ с очереди.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="autoReplyMaxPerHour">
              Лимит автоответов в час
            </label>
            <input
              id="autoReplyMaxPerHour"
              name="autoReplyMaxPerHour"
              type="number"
              min={1}
              max={1000}
              defaultValue={settings.autoReplyMaxPerHour}
              className="field"
            />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="ozonMarkProcessed"
            defaultChecked={settings.ozonMarkProcessed}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Ozon: помечать отзыв обработанным</span>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">
              Передаёт mark_review_as_processed вместе с комментарием, чтобы отзыв ушёл из очереди в
              кабинете Ozon.
            </span>
          </span>
        </label>

        <div>
          <label className="label" htmlFor="n8nSendWebhookUrl">
            Вебхук n8n для немедленной отправки
          </label>
          <input
            id="n8nSendWebhookUrl"
            name="n8nSendWebhookUrl"
            defaultValue={settings.n8nSendWebhookUrl ?? ''}
            placeholder="https://n8n.example.com/webhook/mp-send-answer"
            className="field"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Необязательно. Без вебхука ответы уходят по расписанию воркфлоу отправки, с вебхуком -
            сразу после нажатия «Поставить».
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Сохраняем...' : 'Сохранить'}
        </button>
        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-emerald-700">Сохранено</p> : null}
      </div>
    </form>
  )
}
