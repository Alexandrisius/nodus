# apps/api — @nodus/api

Backend портала: модульный монолит на NestJS 12 (адаптер Fastify), ESM.

## Запуск

- `pnpm dev` (в корне через turbo, или здесь) — `nest start --watch`, порт `API_PORT` (по умолчанию 3001).
- `pnpm build && pnpm start` — прод-режим из `dist/`.

## Структура

- `src/main.ts` — bootstrap: Fastify-адаптер, глобальный префикс `/api/v1`.
- `src/core/` — сквозные механизмы (ошибки, EventBus, guards RBAC, аудит...) — появляется в issue #2.
- `src/modules/<name>/` — доменные модули (controller/service/repository/dto/events, паттерн — `docs/architecture/patterns.md`).
- `src/infra/` — клиенты инфраструктуры (Prisma, Redis, MinIO, mail).
- `src/health/` — проверка живости `GET /api/v1/health` (используется Docker healthcheck).

## Лимиты

- Cross-module импорты запрещены (I3, I6) — контролируется ESLint boundaries.
- Ответы наружу валидируются zod-схемами из `@nodus/contracts`.
