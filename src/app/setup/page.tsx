import { redirect } from 'next/navigation'
import { setupAdminAction } from '@/actions/auth'
import { CredentialsForm } from '@/components/credentials-form'
import { countUsers } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  // Страница одноразовая: как только администратор создан, она закрывается.
  if ((await countUsers()) > 0) redirect('/login')

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Первый запуск</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
          Создайте администратора. Остальных пользователей он добавит внутри панели.
        </p>
        <CredentialsForm action={setupAdminAction} submitLabel="Создать администратора" autoCompleteNewPassword />
      </div>
    </main>
  )
}
