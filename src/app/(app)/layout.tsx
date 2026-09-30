import { Nav } from '@/components/nav'
import { requireUser } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
