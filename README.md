# Склад компонентов

Веб-приложение для учёта электронных компонентов на складе. Mobile-first, у каждого пользователя свой каталог. Карточки в стиле маркетплейса, фото и данные в S3-совместимом хранилище.

## Стек

- **Next.js 15** (App Router), React 19, TypeScript
- **Tailwind CSS v4**
- **S3-совместимое** хранилище (AWS S3 / Yandex Cloud / MinIO) — для фото **и** пользовательских данных
- **Auth.js v5 (NextAuth)** — вход по логину/паролю (Credentials + JWT)

## Модель данных

Все данные хранятся в S3 (без базы данных):

| Ключ | Содержимое |
| --- | --- |
| `users/index.json` | `{ byLogin: {…}, byId: {…} }` — все пользователи |
| `users/{userId}/catalog.json` | массив компонентов пользователя |
| `public/images/{userId}/{uuid}.ext` | загруженные фото (публичный доступ) |

Набор полей компонента фиксирован в коде (`lib/schema.ts`, Zod-схема): `name`, `images[]`, `quantity`, `status`, `type`, `tags[]`, `note`, `url`.

## Быстрый старт (локально)

Нужны Node.js 20+ и Docker.

```bash
# 1. Поднять MinIO (S3-совместимое хранилище)
docker-compose up -d

# 2. Переменные окружения
cp .env.example .env
# Заполни S3_* и AUTH_SECRET (openssl rand -base64 32)

# 3. Зависимости
pnpm install

# 4. Залить демо-данные в S3
pnpm db:seed    # пользователь demo / пароль demo12345 + 32 компонента

# 5. Запуск
pnpm dev        # http://localhost:3000
```

Демо-аккаунт: **логин `demo`, пароль `demo12345`** (или зарегистрируйте свой).
Консоль MinIO: http://localhost:9001 (`minioadmin` / `minioadmin`).

## Скрипты

| Команда | Действие |
| --- | --- |
| `pnpm dev` | дев-сервер |
| `pnpm build` | прод-сборка |
| `pnpm start` | запуск прод-сборки |
| `pnpm typecheck` | проверка типов |
| `pnpm db:seed` | записать демо-данные в S3 |

## Переменные окружения

См. `.env.example`. Ключевые:

- `AUTH_SECRET` — секрет Auth.js (`openssl rand -base64 32`).
- `S3_ENDPOINT` — пустой для AWS; для YC: `https://storage.yandexcloud.net`; для MinIO: `http://localhost:9000`.
- `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- `S3_FORCE_PATH_STYLE` — `true` для MinIO/YC.
- `S3_PUBLIC_URL` — базовый URL для публичных фото (без слеша); хост добавляется в `images.remotePatterns`.

## Загрузка изображений

Файлы льются на сервер через `POST /api/upload` (по одному — лимит ~4.5 МБ serverless), сохраняются под `public/images/...` в S3. До 10 фото на компонент. Превью через `next/image`.

## S3: публичность и безопасность

Политика бакета открывает анонимное чтение **только на `public/*`** (фото). Пользовательские данные (`users/*`) приватны и читаются только с сервера по ключам SDK. Шаблон политики: `infra/yc-bucket-policy.json`. Подробнее: `infra/README.md`.

## Деплой на Vercel

1. Публичный GitHub-репозиторий (`.env` в `.gitignore`).
2. В Vercel задать переменные: `AUTH_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL`.
3. Build command: `pnpm build` (без миграций — БД нет).
4. После первого деплоя запустить сид: `pnpm db:seed` локально с прод-переменными (или добавить как release command).

## Безопасность

- Пароли хешируются (bcrypt), хранятся в `users/index.json` в приватной части S3.
- Все страницы и API закрыты авторизацией (`middleware.ts`).
- Каталог компонентов скоуплен по `ownerId` — чужой каталог недоступен.
- Секреты только в `.env` / Vercel env vars.
