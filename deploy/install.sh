#!/usr/bin/env bash
# Разворачивает панель на чистом сервере: Docker, сборка, миграции, запуск.
# Запускать из каталога deploy: bash install.sh
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Ставлю Docker"
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker есть, а плагин compose - нет. Поставьте docker-compose-plugin и запустите скрипт заново." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "==> Создаю .env со свежими секретами"
  cp .env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')|" .env
  sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=$(openssl rand -hex 32)|" .env
  chmod 600 .env
  echo "    Секреты сгенерированы в deploy/.env. Домен правится там же, в PANEL_DOMAIN."
else
  echo "==> .env уже есть, секреты не трогаю"
fi

echo "==> Собираю образы (первый раз это несколько минут)"
docker compose build

echo "==> Поднимаю базу"
docker compose up -d db

echo "==> Накатываю миграции"
docker compose run --rm migrate

echo "==> Запускаю панель"
docker compose up -d panel caddy

echo "==> Жду, пока панель ответит"
for i in $(seq 1 30); do
  if docker compose exec -T panel wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "    панель отвечает"
    break
  fi
  sleep 2
  if [ "$i" = "30" ]; then
    echo "    панель не ответила за минуту, смотрите: docker compose logs panel" >&2
  fi
done

echo
echo "Готово."
echo "Ключ для n8n (заголовок x-api-key):"
grep '^N8N_API_KEY=' .env | cut -d= -f2
echo
echo "1. Откройте панель в браузере и создайте администратора."
echo "2. Внесите токены в разделе «Подключения» и нажмите «Проверить»."
echo "3. Импортируйте воркфлоу из каталога n8n и подставьте адрес панели и ключ выше."
