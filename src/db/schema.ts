import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/** Маркетплейсы, которые поддерживает панель. */
export const MARKETPLACES = ['wb', 'ozon'] as const
export type Marketplace = (typeof MARKETPLACES)[number]

/**
 * Жизненный цикл отзыва:
 *  new      - пришёл из n8n, ждёт оператора
 *  queued   - ответ подтверждён (вручную или автоматически), ждёт отправки
 *  sending  - забран воркфлоу отправки, ответ ещё не подтверждён маркетплейсом
 *  sent     - маркетплейс принял ответ
 *  failed   - отправка сорвалась, можно повторить
 *  skipped  - оператор решил не отвечать
 */
export const REVIEW_STATUSES = ['new', 'queued', 'sending', 'sent', 'failed', 'skipped'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const ROLES = ['admin', 'operator'] as const
export type Role = (typeof ROLES)[number]

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    login: text('login').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('operator'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_login_idx').on(t.login)],
)

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    marketplace: text('marketplace').notNull(),
    /** id отзыва на стороне маркетплейса: строка у WB, uuid у Ozon. */
    externalId: text('external_id').notNull(),

    rating: integer('rating'),
    text: text('text'),
    /** WB отдаёт достоинства и недостатки отдельными полями, Ozon - нет. */
    pros: text('pros'),
    cons: text('cons'),
    authorName: text('author_name'),

    productName: text('product_name'),
    /** nmId у WB, sku у Ozon. */
    productSku: text('product_sku'),
    productBrand: text('product_brand'),
    productArticle: text('product_article'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),

    mpCreatedAt: timestamp('mp_created_at', { withTimezone: true }),

    status: text('status').notNull().default('new'),
    aiDraft: text('ai_draft'),
    aiModel: text('ai_model'),
    aiGeneratedAt: timestamp('ai_generated_at', { withTimezone: true }),

    answerText: text('answer_text'),
    /** manual - оператор нажал «Поставить», auto - сработало правило автоответа. */
    answerSource: text('answer_source'),
    answeredByUserId: integer('answered_by_user_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),

    /** Полный ответ маркетплейса, чтобы не терять поля, которых нет в схеме. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reviews_mp_external_idx').on(t.marketplace, t.externalId),
    index('reviews_status_idx').on(t.status),
    index('reviews_mp_created_idx').on(t.mpCreatedAt),
  ],
)

/** Настройки панели: единственная строка с id = 1. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  /**
   * Единственный переключатель автоответа: включён - черновик ИИ уходит на
   * маркетплейс сам, выключен - всё ждёт оператора. Без черновика автоответ
   * не срабатывает никогда, даже если переключатель включён.
   */
  autoReplyEnabled: boolean('auto_reply_enabled').notNull().default(false),
  /** Ozon: помечать отзыв обработанным вместе с комментарием. */
  ozonMarkProcessed: boolean('ozon_mark_processed').notNull().default(true),
  /** Тон ответов. Правится в панели, деплой не нужен. */
  aiPrompt: text('ai_prompt').notNull().default(''),
  aiModel: text('ai_model').notNull().default('gpt-6-luna'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Доступы к внешним системам: вводятся администратором в панели и лежат
 * зашифрованными (AES-256-GCM, ключ в ENCRYPTION_KEY). В коде они никогда
 * не попадают в логи и не отдаются наружу - только хвост через maskSecret.
 */
export const integrations = pgTable('integrations', {
  id: integer('id').primaryKey().default(1),
  wbToken: text('wb_token'),
  ozonClientId: text('ozon_client_id'),
  ozonApiKey: text('ozon_api_key'),
  openaiApiKey: text('openai_api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  marketplace: text('marketplace').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  fetched: integer('fetched').notNull().default(0),
  created: integer('created').notNull().default(0),
  status: text('status').notNull().default('ok'),
  error: text('error'),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id'),
    action: text('action').notNull(),
    reviewId: integer('review_id'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
)

export type User = typeof users.$inferSelect
export type Review = typeof reviews.$inferSelect
export type Settings = typeof settings.$inferSelect
export type Integrations = typeof integrations.$inferSelect
