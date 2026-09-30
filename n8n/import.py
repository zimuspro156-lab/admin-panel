#!/usr/bin/env python3
"""
Заливает воркфлоу панели в n8n через Public API.

Ничего не меняет и не удаляет: создаёт одну credential и два новых воркфлоу.
Если воркфлоу с такими именами уже есть, скрипт останавливается и ничего
не трогает - соседние воркфлоу инстанса в безопасности.

Запуск:
    python3 n8n/import.py \
        --n8n-url https://n8n.example.com \
        --n8n-token "<токен n8n Public API>" \
        --panel-url https://panel.example.com \
        --panel-key "<N8N_API_KEY из deploy/.env>"

Токены можно передать через переменные окружения N8N_TOKEN и PANEL_KEY,
чтобы они не осели в истории команд.
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

WORKFLOW_FILES = ['01-sync-reviews.json', '02-flush-answers.json']
CREDENTIAL_NAME = 'Панель x-api-key'
PLACEHOLDER_URL = 'https://ПАНЕЛЬ.example.com'
PLACEHOLDER_CREDENTIAL = 'REPLACE_PANEL_CREDENTIAL_ID'


def request(url, token, method='GET', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('X-N8N-API-KEY', token)
    req.add_header('Accept', 'application/json')
    if data:
        req.add_header('Content-Type', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode()[:500]
        raise SystemExit(f'n8n ответил {error.code} на {method} {url}\n  {detail}')
    except urllib.error.URLError as error:
        raise SystemExit(f'Не достучался до n8n по адресу {url}\n  {error.reason}')


def main():
    parser = argparse.ArgumentParser(description='Импорт воркфлоу панели отзывов в n8n')
    parser.add_argument('--n8n-url', required=True, help='адрес n8n, например https://n8n.example.com')
    parser.add_argument('--n8n-token', default=os.environ.get('N8N_TOKEN'), help='токен n8n Public API')
    parser.add_argument('--panel-url', required=True, help='адрес панели, например https://panel.example.com')
    parser.add_argument('--panel-key', default=os.environ.get('PANEL_KEY'), help='N8N_API_KEY панели')
    parser.add_argument('--no-activate', action='store_true', help='создать, но не включать')
    parser.add_argument('--dry-run', action='store_true', help='только показать, что будет сделано')
    args = parser.parse_args()

    if not args.n8n_token:
        raise SystemExit('Не задан токен n8n: --n8n-token или переменная N8N_TOKEN')
    if not args.panel_key:
        raise SystemExit('Не задан ключ панели: --panel-key или переменная PANEL_KEY')

    base = args.n8n_url.rstrip('/')
    api = f'{base}/api/v1'
    panel_url = args.panel_url.rstrip('/')

    here = pathlib.Path(__file__).parent
    workflows = []
    for name in WORKFLOW_FILES:
        path = here / name
        if not path.exists():
            raise SystemExit(f'Не найден файл воркфлоу: {path}')
        workflows.append((name, json.loads(path.read_text(encoding='utf-8'))))

    print(f'==> Проверяю доступ к n8n: {base}')
    existing = request(f'{api}/workflows?limit=250', args.n8n_token)
    existing_names = {item.get('name') for item in existing.get('data', [])}
    print(f'    Доступ есть. Воркфлоу на инстансе: {len(existing_names)}')
    for name in sorted(n for n in existing_names if n):
        print(f'      - {name}')

    # Ничего не перезаписываем: совпадение имени - повод остановиться.
    clashes = [wf['name'] for _, wf in workflows if wf['name'] in existing_names]
    if clashes:
        raise SystemExit(
            'Останавливаюсь, чтобы ничего не сломать. Такие воркфлоу уже есть:\n  '
            + '\n  '.join(clashes)
            + '\nУдалите или переименуйте их в n8n и запустите скрипт заново.'
        )

    if args.dry_run:
        print('\n--dry-run: дальше я бы создал credential и два воркфлоу:')
        for _, wf in workflows:
            print(f'  - {wf["name"]} ({len(wf["nodes"])} узла)')
        return

    print(f'\n==> Создаю credential «{CREDENTIAL_NAME}»')
    credential = request(
        f'{api}/credentials',
        args.n8n_token,
        method='POST',
        payload={
            'name': CREDENTIAL_NAME,
            'type': 'httpHeaderAuth',
            'data': {'name': 'x-api-key', 'value': args.panel_key},
        },
    )
    credential_id = credential.get('id') or credential.get('data', {}).get('id')
    if not credential_id:
        raise SystemExit(f'n8n не вернул id credential: {credential}')
    print(f'    id: {credential_id}')

    created = []
    for filename, workflow in workflows:
        print(f'\n==> Создаю воркфлоу «{workflow["name"]}» из {filename}')

        for node in workflow['nodes']:
            params = node.get('parameters', {})
            if isinstance(params.get('url'), str):
                params['url'] = params['url'].replace(PLACEHOLDER_URL, panel_url)

            creds = node.get('credentials', {})
            for cred_type, value in creds.items():
                if value.get('id') == PLACEHOLDER_CREDENTIAL:
                    creds[cred_type] = {'id': credential_id, 'name': CREDENTIAL_NAME}

        # Public API принимает ровно эти четыре поля.
        payload = {
            'name': workflow['name'],
            'nodes': workflow['nodes'],
            'connections': workflow['connections'],
            'settings': workflow.get('settings', {'executionOrder': 'v1'}),
        }
        result = request(f'{api}/workflows', args.n8n_token, method='POST', payload=payload)
        workflow_id = result.get('id') or result.get('data', {}).get('id')
        if not workflow_id:
            raise SystemExit(f'n8n не вернул id воркфлоу: {result}')
        print(f'    id: {workflow_id}')
        created.append((workflow['name'], workflow_id))

        if not args.no_activate:
            request(f'{api}/workflows/{workflow_id}/activate', args.n8n_token, method='POST')
            print('    включён')

    print('\nГотово. Создано:')
    for name, workflow_id in created:
        print(f'  {name}  ->  {base}/workflow/{workflow_id}')
    print(f'\nСоседние воркфлоу не тронуты: скрипт только создавал.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
