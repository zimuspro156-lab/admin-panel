import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Отзывы WB и Ozon',
  description: 'Админ-панель для работы с отзывами маркетплейсов',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
