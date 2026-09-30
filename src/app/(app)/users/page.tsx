import { asc } from 'drizzle-orm'
import { toggleUserAction } from '@/actions/users'
import { CreateUserForm, ResetPasswordForm } from '@/components/user-forms'
import { db } from '@/db'
import { users } from '@/db/schema'
import { formatDateTime } from '@/lib/format'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const admin = await requireRole('admin')
  const rows = await db.select().from(users).orderBy(asc(users.id))

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Пользователи</h1>

      <CreateUserForm />

      <div className="card divide-y divide-[var(--color-line)]">
        {rows.map((user) => (
          <div key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <div className="min-w-48">
              <p className="font-medium">
                {user.login}
                {user.id === admin.id ? (
                  <span className="ml-2 text-xs text-[var(--color-muted)]">это вы</span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {user.role === 'admin' ? 'администратор' : 'оператор'} · создан{' '}
                {formatDateTime(user.createdAt)} · вход {formatDateTime(user.lastLoginAt)}
              </p>
            </div>

            <span
              className={
                user.isActive
                  ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                  : 'rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600'
              }
            >
              {user.isActive ? 'активен' : 'отключён'}
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <ResetPasswordForm userId={user.id} login={user.login} />

              {user.id === admin.id ? null : (
                <form action={toggleUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button type="submit" className="btn-ghost text-xs">
                    {user.isActive ? 'Отключить' : 'Включить'}
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
