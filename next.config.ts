import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone-сборка нужна образу: он запускается как node server.js.
  output: 'standalone',
  images: {
    // Фото из отзывов лежат на CDN маркетплейсов.
    remotePatterns: [
      { protocol: 'https', hostname: '**.wbbasket.ru' },
      { protocol: 'https', hostname: '**.wb.ru' },
      { protocol: 'https', hostname: '**.ozone.ru' },
      { protocol: 'https', hostname: '**.ozon.ru' },
    ],
  },
}

export default nextConfig
