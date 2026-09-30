# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Сборке база не нужна: все страницы рендерятся на запрос.
ENV NEXT_TELEMETRY_DISABLED=1
# Потолок кучи, чтобы сборка не выдавила в swap соседей по серверу.
# Поднять на просторной машине: --build-arg BUILD_MEMORY_MB=4096
ARG BUILD_MEMORY_MB=1536
ENV NODE_OPTIONS=--max-old-space-size=${BUILD_MEMORY_MB}
RUN npm run build

# Отдельный образ для миграций: здесь есть drizzle-kit и исходники,
# которых намеренно нет в рантайм-образе.
FROM builder AS migrator
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
