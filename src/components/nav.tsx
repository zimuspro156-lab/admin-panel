import Link from 'next/link'
import { logoutAction } from '@/actions/auth'
import type { User } from '@/db/schema'

const links = [
  { href: '/reviews', label: 'Отзывы' },
  { href: '/settings', label: 'Настройки', adminOnly: true },
  { href: '/users', label: 'Пользователи', adminOnly: true },
]

export function Nav({ user }: { user: User }) {
  return (
    <header className="border-b border-[var(--color-line)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="font-semibold">Отзывы МП</span>

        <nav className="flex items-center gap-1 text-sm">
          {links
            .filter((link) => !link.adminOnly || user.role === 'admin')
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-[var(--color-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
              >
                {link.label}
              </Link>
            ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm text-[var(--color-muted)]">
          <span>
            {user.login}
            {user.role === 'admin' ? ' · админ' : ''}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost px-2 py-1 text-xs">
              Выйти
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
