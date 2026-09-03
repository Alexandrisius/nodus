# apps/web — @nodus/web

Фронтенд портала: React 19 SPA на Vite (без Next.js — портал за логином, SEO не нужен).

## Запуск

- `pnpm dev` — Vite dev-сервер, порт `NODUS_WEB_DEV_PORT` (по умолчанию 5173). `/api` и `/socket.io` проксируются на локальные api/gateway (см. `vite.config.ts`).
- `pnpm build` — статическая сборка в `dist/` (в docker раздаётся nginx, см. `infra/nginx/web.conf`).
- `VITE_API_MOCK=true` в корневом `.env` — MSW-режим (ADR-0001): фронт целиком на моках без бэкенда (концепт, демо руководству). Воркер — `public/mockServiceWorker.js` (`msw init public`), хендлеры фич — в `features/*/api/mocks/`, демо-данные — в `src/shared/mocks/data/`.

## Структура (по `docs/architecture/repository-structure.md`)

- `src/app/` — роутер (TanStack Router, code-splitting по модулям), провайдеры, каркас `shell/`: левое меню 240px, топбар (подразделы, Ctrl+K, уведомления, профиль), правая полоса аватарок 56px, слайдеры со стеком и URL на уровень (§10.2 ux-principles).
- `src/features/<module>/` — фичи, зеркало backend-модулей (`api/`, `components/`, `pages/`, `model/`, README).
- `src/shared/` — переиспользуемое: lib, hooks, ui (аватар, чип срока), mock-данные.
- `src/ws/` — WebSocket-клиент, синхронизация, офлайн-очередь.

## Темы

Всё визуальное — дизайн-токенами `@nodus/ui` (тема как данные): `:root` — «Тушь» (тёмная, базовая), `[data-theme='paper']` — «Бумага» (светлая); переключатель в топбаре. Компоненты не содержат значений токенов.

«Скетчевость» стиля — не бордерами, а искажением: `SketchFilters` (`app/shell/sketch-filters.tsx`) объявляет глобальные SVG-фильтры `#rough-sm/md/lg` (feTurbulence + feDisplacementMap); утилита `paper-card` рисует обе карандашные обводки псевдоэлементами через `filter: url(#rough-…)`, поэтому линии «от руки», а текст остаётся чистым. Иллюстрации вживляются в бумагу через `mix-blend-multiply` без рамок.

## Лимиты

- UI-примитивы — только из `@nodus/ui`, локальные копии запрещены.
- Данные — только через хуки `features/*/api/` (TanStack Query), `fetch` в компонентах запрещён; query keys — только через factory.
- UI-строки — из i18n (`@nodus/contracts`, `ui`), не из кода компонентов (I15); терминология — русская деловая.
- Cross-feature импорты запрещены (ESLint boundaries): общее — `@nodus/contracts`, `@nodus/ui`, `src/shared`.
