import { ConnectionsForm } from '@/components/connections-form'
import { requireRole } from '@/lib/auth'
import { getIntegrationsStatus } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage() {
  await requireRole('admin')
  const status = await getIntegrationsStatus()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Подключения</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Доступы к маркетплейсам и OpenAI. Панель ходит в них сама, наружу ключи не отдаёт.
        </p>
      </div>

      <ConnectionsForm status={status} />
    </div>
  )
}
