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

# Сборка Next.js - самый прожорливый шаг: на 2 ГБ без подкачки она падает с
# OOM посреди процесса, и это выглядит как непонятная ошибка сборки.
ensure_memory() {
  local ram_mb swap_mb total_mb
  ram_mb=$(free -m | awk '/^Mem:/ {print $2}')
  swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
  total_mb=$((ram_mb + swap_mb))

  echo "==> Память: ${ram_mb} МБ RAM + ${swap_mb} МБ swap"
  if [ "$total_mb" -ge 3000 ]; then
    return 0
  fi

  echo "    Для сборки этого мало. Добавляю файл подкачки на 2 ГБ."
  if [ -f /swapfile ]; then
    echo "    /swapfile уже есть, подключаю"
  else
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    Подкачка включена: $(free -m | awk '/^Swap:/ {print $2}') МБ"
}

ensure_disk() {
  local free_gb
  free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  echo "==> Свободно на диске: ${free_gb} ГБ"
  if [ "$free_gb" -lt 5 ]; then
    echo "    Меньше 5 ГБ. Образам и сборке этого впритык; освободите место, если сборка упадёт." >&2
  fi
}

if [ "$(id -u)" = "0" ]; then
  ensure_memory
else
  echo "==> Скрипт запущен не от root, проверку памяти пропускаю"
fi
ensure_disk

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

# Занят ли порт на хосте. Нужно и для выбора порта панели, и для решения,
# поднимать ли свой Caddy. Проверка предварительная: последнее слово за
# реальной попыткой запуска ниже.
port_busy() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
}

# Порт 3000 занят на многих серверах. Подбираем свободный и запоминаем его
# в .env, чтобы между перезапусками он не менялся.
pick_panel_bind() {
  local configured host port candidate
  configured=$(grep -E '^PANEL_BIND=' .env 2>/dev/null | cut -d= -f2-)
  host=${configured%:*}
  port=${configured##*:}
  case "$host" in '' | "$configured") host=127.0.0.1 ;; esac
  case "$port" in '' | *[!0-9]*) port=3000 ;; esac

  candidate=$port
  while port_busy "$candidate" && [ "$candidate" -lt 3200 ]; do
    candidate=$((candidate + 1))
  done

  if [ "$candidate" != "$port" ]; then
    echo "    Порт $port занят, панель переезжает на $candidate" >&2
  fi
  echo "$host:$candidate"
}

PANEL_BIND_VALUE=$(pick_panel_bind)
if grep -qE '^PANEL_BIND=' .env; then
  sed -i "s|^PANEL_BIND=.*|PANEL_BIND=${PANEL_BIND_VALUE}|" .env
else
  echo "PANEL_BIND=${PANEL_BIND_VALUE}" >> .env
fi
echo "==> Панель будет слушать ${PANEL_BIND_VALUE}"

echo "==> Запускаю панель"
docker compose up -d db panel

USE_CADDY=no
if port_busy 80 || port_busy 443; then
  echo "==> Порты 80 или 443 уже заняты - свой Caddy не поднимаю, чтобы не задеть то, что там стоит"
elif docker compose --profile edge up -d caddy 2>/tmp/caddy-start.err; then
  USE_CADDY=yes
  echo "==> Caddy поднят на 80/443"
else
  echo "==> Caddy подняться не смог, оставляю панель без него:"
  sed 's/^/    /' /tmp/caddy-start.err >&2
  docker compose rm -sf caddy >/dev/null 2>&1 || true
fi

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
if [ "$USE_CADDY" = "no" ]; then
  cat <<'HINT'

Панель слушает 127.0.0.1:3000. Добавьте её в уже стоящий веб-сервер.

  nginx:
    server {
        server_name panel.example.com;
        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

  Caddy:
    panel.example.com {
        reverse_proxy 127.0.0.1:3000
    }

HINT
fi

echo "1. Откройте панель в браузере и создайте администратора."
echo "2. Внесите токены в разделе «Подключения» и нажмите «Проверить»."
echo "3. Залейте воркфлоу: python3 ../n8n/import.py --n8n-url ... --panel-url ..."
