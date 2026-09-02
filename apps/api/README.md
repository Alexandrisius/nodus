# apps/api — @nodus/api

Backend портала: модульный монолит на NestJS 12 (адаптер Fastify), ESM.

## Запуск

- `pnpm dev` (в корне через turbo, или здесь) — `nest start --watch`, порт `API_PORT` (по умолчанию 3001).
- `pnpm build && pnpm start` — прод-режим из `dist/`.

## Структура

- `src/main.ts` — bootstrap: Fastify-адаптер, глобальный префикс `/api/v1`, подключение OpenAPI.
- `src/core/` — сквозные механизмы (ошибки, EventBus, guards RBAC, аудит, openapi...).
- `src/modules/<name>/` — доменные модули (controller/service/repository/dto/events, паттерн — `docs/architecture/patterns.md`).
- `src/infra/` — клиенты инфраструктуры (Prisma, Redis, MinIO, mail).
- `src/health/` — проверка живости `GET /api/v1/health` (используется Docker healthcheck).

## OpenAPI / документация (I2, ADR-0006)

Спецификация генерируется из кода (`@nestjs/swagger` + zod-схемы `@nodus/contracts`,
нативный Standard Schema) и публикуется на `/api/docs` (UI), `/api/docs-json`, `/api/docs-yaml` —
только для авторизованных (access-JWT в `Authorization: Bearer`). Подключение — `setupOpenApi`
(`src/core/openapi/openapi.setup.ts`) в `main.ts`; защита — `docs-auth.middleware.ts`
(маршруты документации регистрируются в обход гуардов). Паттерн аннотаций —
`docs/architecture/patterns.md`, раздел «OpenAPI-аннотации».

## Лимиты

- Cross-module импорты запрещены (I3, I6) — контролируется ESLint boundaries.
- Ответы наружу валидируются zod-схемами из `@nodus/contracts`.
