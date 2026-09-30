'use client'

import { useActionState } from 'react'
import { createUserAction, resetPasswordAction } from '@/actions/users'

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, {})

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <h2 className="font-medium">Новый пользователь</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="new-login">
            Логин
          </label>
          <input
            id="new-login"
            name="login"
            className="field"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
          />
        </div>

        <div>
          <label className="label" htmlFor="new-password">
            Пароль
          </label>
          <input
            id="new-password"
            name="password"
            type="text"
            className="field"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="label" htmlFor="new-role">
            Роль
          </label>
          <select id="new-role" name="role" className="field" defaultValue="operator">
            <option value="operator">Оператор</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Пароль показан открытым, чтобы его можно было передать сотруднику. В базе хранится только
        хеш bcrypt, восстановить пароль позже нельзя - только задать новый.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Создаём...' : 'Создать'}
        </button>
        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-emerald-700">Пользователь создан</p> : null}
      </div>
    </form>
  )
}

export function ResetPasswordForm({ userId, login }: { userId: number; login: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, {})

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="password"
        type="text"
        placeholder="Новый пароль"
        aria-label={`Новый пароль для ${login}`}
        className="field w-44"
        required
        minLength={8}
      />
      <button type="submit" className="btn-ghost text-xs" disabled={pending}>
        {pending ? '...' : 'Сменить пароль'}
      </button>
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
      {state.ok ? <span className="text-xs text-emerald-700">Готово</span> : null}
    </form>
  )
}
