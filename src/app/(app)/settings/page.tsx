import { SettingsForm } from '@/components/settings-form'
import { formatDateTime } from '@/lib/format'
import { requireRole } from '@/lib/auth'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireRole('admin')
  const settings = await getSettings()

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Настройки</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Обновлено {formatDateTime(settings.updatedAt)}
        </p>
      </div>

      <SettingsForm settings={settings} />

      <p className="text-sm text-[var(--color-muted)]">
        Токены Wildberries и Ozon и ключ OpenAI живут в credentials n8n, а не в панели. Панель не
        обращается к маркетплейсам напрямую.
      </p>
    </div>
  )
}
