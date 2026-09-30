import { redirect } from 'next/navigation'
import { loginAction } from '@/actions/auth'
import { CredentialsForm } from '@/components/credentials-form'
import { countUsers, getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Пустая база означает, что панель ещё не настроена.
  if ((await countUsers()) === 0) redirect('/setup')
  if (await getCurrentUser()) redirect('/reviews')

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Отзывы WB и Ozon</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">Вход в админ-панель</p>
        <CredentialsForm action={loginAction} submitLabel="Войти" />
      </div>
    </main>
  )
}
