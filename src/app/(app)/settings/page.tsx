import { ImportHistoryForm, RunSyncForm, SettingsForm } from '@/components/settings-form'
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

      <div className="card p-4">
        <h2 className="mb-2 font-medium">Выгрузка вне расписания</h2>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Обычно отзывы забирает n8n раз в час. Эта кнопка делает то же самое прямо сейчас.
        </p>
        <RunSyncForm />
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-medium">История отзывов</h2>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Обычная выгрузка забирает только неотвеченные отзывы - это рабочая очередь. Чтобы увидеть
          в панели всё, что было раньше, включая уже отвеченное и архив Wildberries, запустите
          загрузку истории. Такие отзывы приходят со статусом «Отвечен», черновики для них не
          генерируются и денег за ИИ не стоят. Достаточно сделать это один раз.
        </p>
        <ImportHistoryForm />
      </div>
    </div>
  )
}
