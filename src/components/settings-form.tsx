'use client'

import { useActionState } from 'react'
import { runSyncAction, updateSettingsAction } from '@/actions/settings'
import type { Settings } from '@/db/schema'

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, {})

  return (
    <form action={formAction} className="space-y-6">
      <section className="card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="autoReplyEnabled"
            defaultChecked={settings.autoReplyEnabled}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Автоответ</span>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">
              Включён - черновик ИИ уходит на маркетплейс сам, без подтверждения. Выключен - каждый
              ответ отправляет оператор. Отзыв, для которого черновик не сгенерировался, в любом
              случае остаётся оператору.
            </span>
          </span>
        </label>
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="aiPrompt">
            Как ИИ должен отвечать
          </label>
          <textarea
            id="aiPrompt"
            name="aiPrompt"
            defaultValue={settings.aiPrompt}
            rows={14}
            className="field resize-y font-mono text-xs"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Допишите сюда название бренда, стоп-слова и что писать на 1-2 звезды. Меняется на лету,
            переустановка не нужна.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="aiModel">
            Модель OpenAI
          </label>
          <input id="aiModel" name="aiModel" defaultValue={settings.aiModel} className="field max-w-xs" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Актуальный список идентификаторов: developers.openai.com/api/docs/models
          </p>
        </div>
      </section>

      <section className="card p-4">
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
              Передаёт mark_review_as_processed вместе с ответом, чтобы отзыв ушёл из очереди в
              кабинете Ozon.
            </span>
          </span>
        </label>
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

export function RunSyncForm() {
  const [state, formAction, pending] = useActionState(runSyncAction, {})

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn-ghost text-sm" disabled={pending}>
        {pending ? 'Забираем отзывы...' : 'Выгрузить отзывы сейчас'}
      </button>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
    </form>
  )
}
