# apps/web — @nodus/web

Фронтенд портала: React 19 SPA на Vite (без Next.js — портал за логином, SEO не нужен).

## Запуск

- `pnpm dev` — Vite dev-сервер, порт `NODUS_WEB_DEV_PORT` (по умолчанию 5173). `/api` и `/socket.io` проксируются на локальные api/gateway (см. `vite.config.ts`).
- `pnpm build` — статическая сборка в `dist/` (в docker раздаётся nginx, см. `infra/nginx/web.conf`).

## Структура (по `docs/architecture/repository-structure.md`)

- `src/app/` — роутер, провайдеры, layout-оболочка (сейчас — заглушка `App`; каркас — issue #4).
- `src/features/<module>/` — фичи, зеркало backend-модулей (`api/`, `components/`, `pages/`, `model/`, README).
- `src/shared/` — переиспользуемое: lib, hooks, re-export ui-kit.
- `src/ws/` — WebSocket-клиент, синхронизация, офлайн-очередь.

## Лимиты

- UI-примитивы — только из `@nodus/ui` (появится в issue #4), локальные копии запрещены.
- Данные — только через хуки `features/*/api/` (TanStack Query), `fetch` в компонентах запрещён.
- UI-строки — из i18n (`@nodus/contracts`), не из кода компонентов (I15); терминология — русская деловая.
