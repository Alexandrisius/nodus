# Участие в разработке Nodus

Спасибо за интерес к проекту. Nodus — открытый (source available) корпоративный портал; разработка ведётся ИИ-агентами под управлением владельца продукта, и патчи от людей проходят те же проверки, что и работа агентов. Этот файл — как поднять портал у себя, влить правку и не сломать правила проекта.

## Требования

Node.js 24 (≥ 24.15, см. `.node-version`), pnpm 11 (`npm i -g pnpm@11`), Docker.

## Быстрый старт

```bash
# Локальная разработка (приложения на хосте, горячая перезагрузка)
pnpm install
pnpm dev        # web :5173 (прокси /api, /socket.io), api :3001, gateway :3002

# Окружение целиком в Docker (web :3000, api :3001, gateway :3002
# + postgres/redis/minio/gotenberg)
cp .env.example .env   # заполнить пароли
docker compose up
```

Проверка живости: `GET http://localhost:3001/api/v1/health`, `GET http://localhost:3002/health`.

Тестовые пользователи для локальной среды — `tests/e2e/e2e-users.json`.

## Команды

| Команда                                 | Что делает                                                |
| --------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                              | dev-режим всех пакетов (turbo)                            |
| `pnpm build`                            | сборка всех пакетов                                       |
| `pnpm lint`                             | ESLint: границы модулей, размер файлов                    |
| `pnpm typecheck`                        | строгий tsc по всем пакетам                               |
| `pnpm test`                             | unit-тесты (Vitest) + тест-кейсы правил линтера           |
| `pnpm test:e2e`                         | e2e (нужен живой стек)                                    |
| `pnpm format`                           | Prettier по репозиторию                                   |
| `docker compose up`                     | dev/демо-окружение в Docker                               |
| `docker compose --profile tunnel up -d` | + Cloudflare Tunnel (нужен `NODUS_TUNNEL_TOKEN` в `.env`) |

## Структура

`apps/web` (React SPA) · `apps/api` (NestJS + Fastify) · `apps/gateway` (WebSocket, Socket.IO) · `apps/desktop` (Tauri-оболочка) · `packages/contracts` (zod-схемы, DTO — единственная точка обмена) · `packages/config` (tsconfig/ESLint-пресеты) · `tests/` (e2e, тест-кейсы правил линтера) · `infra/` (nginx и др.) · `docs/` (документация). Полная схема — [docs/architecture/repository-structure.md](docs/architecture/repository-structure.md).

## Как ведётся работа

- **GitHub Issues — единственный таск-трекер**: нет задачи вне issue. Найденный баг или идею оформляйте issue, а не PR «мимо кассы».
- **Один PR = один issue**, в описании — что/зачем/как проверить + `Closes #N`.
- Ветка от `main`: `feat/<N>-имя`, `fix/<N>-…`, `chore/<N>-…`. Коммиты — [conventional commits](https://www.conventionalcommits.org/ru/) со ссылкой на issue: `feat(tasks): ... (#12)`. Мерж — squash.
- **`main` всегда рабочий**: CI зелёный до мержа; перед push проверяйте, что ветка не отстала от `main`.
- Новая бизнес-логика сопровождается unit-тестами (Vitest) в том же PR; перед мержем должны быть зелёными `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

### Правила кода (коротко)

Полный канон — [AGENTS.md](AGENTS.md) и [docs/architecture/patterns.md](docs/architecture/patterns.md). Главное:

- один файл = одна ответственность, ориентир ≤ 300 строк; имя файла = имя сущности (kebab-case);
- модули друг друга не импортируют — только события и `@nodus/contracts`;
- мутации API идемпотентны (`Idempotency-Key`), списки — курсорная пагинация, ошибки — единый формат `{ code, message, details?, traceId }`;
- UI-мутации оптимистичны (TanStack Query), спиннеры — только для операций > 300 мс;
- терминология интерфейса — русская деловая (Задачи, Поручения, Письма);
- сгенерированное (Prisma client, OpenAPI) не коммитится; секреты — только в `.env`.

### Если вы ИИ-агент

Обязательная точка входа — [AGENTS.md](AGENTS.md): карта документации, инварианты, процесс. Дальше — по таблице «Обязательное чтение» под вашу задачу.

## Лицензия вклада

Отправляя pull request, вы соглашаетесь, что ваш вклад лицензируется на условиях [Elastic License 2.0](LICENSE) вместе с остальным кодом проекта (ADR-0023).
