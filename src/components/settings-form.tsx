'use client'

import { useActionState } from 'react'
import { importHistoryAction, runSyncAction, updateSettingsAction } from '@/actions/settings'
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

      <section className="card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="syncAnswered"
            defaultChecked={settings.syncAnswered}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Подтягивать отвеченные отзывы</span>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">
              Включён - вместе с рабочей очередью приходят последние 20 отзывов, на которые ответ
              уже дан. В карточке будет видно, что ответили вы, а по кнопке «Что ответил бы ИИ?» -
              что предложил бы ИИ. Удобно, чтобы оценить его до включения автоответа. В работу
              такие отзывы не берутся и денег на черновики сами не тратят. Выключен - приходят
              только неотвеченные.
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
          <label className="label" htmlFor="aiKnowledge">
            База знаний: чем ИИ должен располагать
          </label>
          <textarea
            id="aiKnowledge"
            name="aiKnowledge"
            defaultValue={settings.aiKnowledge}
            rows={12}
            placeholder={
              'Бренд: ...\n' +
              'Товары и их особенности: ...\n' +
              'Частые претензии и что на них отвечать: ...\n' +
              'Как связаться с поддержкой: ...\n' +
              'Чего не обещаем: ...'
            }
            className="field resize-y text-sm"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Эти сведения подмешиваются в каждый запрос к ИИ. Сюда пишут про бренд, товары, типовые
            проблемы и готовые формулировки - чтобы ответы опирались на ваши материалы, а не на
            общие слова. Чем конкретнее, тем лучше черновики.
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

export function ImportHistoryForm() {
  const [state, formAction, pending] = useActionState(importHistoryAction, {})

  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" className="btn-ghost text-sm" disabled={pending}>
        {pending ? 'Загружаем историю, это небыстро...' : 'Загрузить всю историю отзывов'}
      </button>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
    </form>
  )
}
