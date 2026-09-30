#!/usr/bin/env bash
# Разворачивает панель на чистом сервере: Docker, сборка, миграции, запуск.
# Запускать из каталога deploy: bash install.sh
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Ставлю Docker"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  echo "==> Создаю .env со свежими секретами"
  cp .env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')|" .env
  sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=$(openssl rand -hex 32)|" .env
  echo "    Секреты сгенерированы. Домен правится в .env (PANEL_DOMAIN)."
fi

echo "==> Собираю образ"
docker compose build

echo "==> Поднимаю базу"
docker compose up -d db

echo "==> Накатываю миграции"
docker compose run --rm --entrypoint sh panel -c 'npx --yes drizzle-kit migrate'

echo "==> Запускаю панель"
docker compose up -d

echo
echo "Готово."
echo "Ключ для n8n (x-api-key):"
grep '^N8N_API_KEY=' .env | cut -d= -f2
echo
echo "Откройте панель и создайте администратора. Дальше внесите токены в разделе «Подключения»."
