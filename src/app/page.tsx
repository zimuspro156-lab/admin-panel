import { redirect } from 'next/navigation'
import { countUsers, getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  if ((await countUsers()) === 0) redirect('/setup')
  redirect((await getCurrentUser()) ? '/reviews' : '/login')
}
