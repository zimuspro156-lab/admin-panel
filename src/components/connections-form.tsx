'use client'

import { useActionState } from 'react'
import { testConnectionsAction, updateIntegrationsAction } from '@/actions/integrations'

export type ConnectionsStatus = {
  wb: boolean
  ozon: boolean
  openai: boolean
  wbTail: string | null
  ozonClientId: string | null
  openaiTail: string | null
}

function Filled({ ok, hint }: { ok: boolean; hint: string | null }) {
  return ok ? (
    <span className="text-xs text-emerald-700">задано{hint ? ` · ...${hint}` : ''}</span>
  ) : (
    <span className="text-xs text-amber-700">не задано</span>
  )
}

export function ConnectionsForm({ status }: { status: ConnectionsStatus }) {
  const [saveState, saveAction, saving] = useActionState(updateIntegrationsAction, {})
  const [testState, testAction, testing] = useActionState(testConnectionsAction, {})

  return (
    <div className="space-y-6">
      <form action={saveAction} className="space-y-6">
        <section className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">Wildberries</h2>
            <Filled ok={status.wb} hint={status.wbTail} />
          </div>
          <div>
            <label className="label" htmlFor="wbToken">
              Токен API
            </label>
            <textarea
              id="wbToken"
              name="wbToken"
              rows={3}
              placeholder={status.wb ? 'Оставьте пустым, чтобы не менять' : 'токен из кабинета продавца'}
              className="field resize-y font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Кабинет продавца → Профиль → Настройки → Доступ к API. Категория «Вопросы и отзывы», флаг
            «Только чтение» должен быть снят: с ним выгрузка работает, а отправка ответов нет.
          </p>
        </section>

        <section className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">Ozon</h2>
            <Filled ok={status.ozon} hint={status.ozonClientId} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ozonClientId">
                Client-Id
              </label>
              <input
                id="ozonClientId"
                name="ozonClientId"
                placeholder={status.ozon ? 'Не менять' : 'числовой идентификатор из кабинета'}
                className="field font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="ozonApiKey">
                Api-Key
              </label>
              <input
                id="ozonApiKey"
                name="ozonApiKey"
                placeholder={status.ozon ? 'Не менять' : 'ключ из кабинета'}
                className="field font-mono text-xs"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Seller → Настройки → API ключи. Работа с отзывами через API требует подписки «Управление
            отзывами» (Premium Plus), без неё Ozon отдаёт ошибку доступа.
          </p>
        </section>

        <section className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">OpenAI</h2>
            <Filled ok={status.openai} hint={status.openaiTail} />
          </div>
          <div>
            <label className="label" htmlFor="openaiApiKey">
              API-ключ
            </label>
            <input
              id="openaiApiKey"
              name="openaiApiKey"
              placeholder={status.openai ? 'Оставьте пустым, чтобы не менять' : 'ключ из платформы OpenAI'}
              className="field font-mono text-xs"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Нужен для генерации черновиков. Без него отзывы будут приходить, но отвечать придётся
            вручную.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
          {saveState.error ? <p className="text-sm text-red-700">{saveState.error}</p> : null}
          {saveState.ok ? <p className="text-sm text-emerald-700">{saveState.message}</p> : null}
        </div>
      </form>

      <form action={testAction} className="card space-y-3 p-4">
        <h2 className="font-medium">Проверка доступов</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Делает по одному настоящему запросу в каждый сервис и показывает, что ответили.
        </p>
        <button type="submit" className="btn-ghost text-sm" disabled={testing}>
          {testing ? 'Проверяем...' : 'Проверить'}
        </button>
        {testState.message ? (
          <pre className="rounded-lg bg-[var(--color-canvas)] p-3 text-xs whitespace-pre-wrap">
            {testState.message}
          </pre>
        ) : null}
        {testState.error ? <p className="text-sm text-red-700">{testState.error}</p> : null}
      </form>

      <p className="text-xs text-[var(--color-muted)]">
        Все ключи хранятся в базе зашифрованными (AES-256-GCM). Панель нигде не показывает их
        целиком и не пишет в журнал - только последние символы, чтобы вы узнали свой ключ.
      </p>
    </div>
  )
}
