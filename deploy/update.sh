#!/usr/bin/env bash
# Обновление панели до свежей версии: сборка, миграции, перезапуск.
# Запускать из каталога deploy: bash update.sh
#
# Отдельный скрипт нужен, чтобы шаг с миграциями нельзя было пропустить:
# без него панель спрашивает у базы колонки, которых там ещё нет, и отдаёт
# пятисотую вместо страницы.
set -euo pipefail

cd "$(dirname "$0")"

compose() {
  if grep -qE '^EDGE_NETWORK=.+' .env 2>/dev/null; then
    docker compose -f docker-compose.yml -f docker-compose.proxy.yml "$@"
  else
    docker compose "$@"
  fi
}

echo "==> Забираю свежую версию"
git -C .. pull --ff-only

echo "==> Собираю образы"
compose build

echo "==> Поднимаю базу"
compose up -d db

echo "==> Накатываю миграции"
compose run --rm migrate

echo "==> Перезапускаю панель"
compose up -d --force-recreate panel

echo "==> Жду ответа панели"
for i in $(seq 1 30); do
  if compose exec -T panel wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "    панель отвечает"
    exit 0
  fi
  sleep 2
done

echo "    панель не ответила за минуту. Смотрите: bash -c 'cd $(pwd) && docker compose logs --tail=50 panel'" >&2
exit 1
