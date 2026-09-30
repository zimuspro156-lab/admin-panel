'use client'

import { useActionState } from 'react'
import type { FormState } from '@/actions/auth'

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  submitLabel: string
  autoCompleteNewPassword?: boolean
}

export function CredentialsForm({ action, submitLabel, autoCompleteNewPassword }: Props) {
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="login">
          Логин
        </label>
        <input
          id="login"
          name="login"
          className="field"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          autoComplete={autoCompleteNewPassword ? 'new-password' : 'current-password'}
          required
          minLength={8}
        />
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? 'Подождите...' : submitLabel}
      </button>
    </form>
  )
}
