import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __mpReviewsDb: NodePgDatabase<typeof schema> | undefined
}

function createDb(): NodePgDatabase<typeof schema> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL не задан')

  const pool = new Pool({
    connectionString: url,
    // Managed Postgres (Neon, Supabase) всегда требует TLS, локальный docker - нет.
    ssl: /\bsslmode=disable\b/.test(url) ? false : { rejectUnauthorized: false },
    // Панель живёт в serverless-рантайме, поэтому пул держим маленьким
    // и подключаемся через pooler-строку (порт 6543 у Supabase, -pooler у Neon).
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
  })

  return drizzle(pool, { schema })
}

/**
 * Подключение создаётся при первом запросе, а не при импорте модуля:
 * сборке Next база не нужна, а в dev пул переживает пересборку модулей.
 */
function getDb(): NodePgDatabase<typeof schema> {
  if (!globalThis.__mpReviewsDb) globalThis.__mpReviewsDb = createDb()
  return globalThis.__mpReviewsDb
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver)
  },
})

export { schema }
