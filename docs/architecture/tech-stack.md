# Технологический стек (зафиксирован)

Выбор зафиксирован. Изменение — только через ADR. Критерии выбора: зрелость, качество поддержки ИИ-агентами, скорость разработки малой командой, open-source лицензии.

Читать: перед инициализацией любого пакета и перед добавлением зависимостей.

## Монорепозиторий

| Компонент | Выбор |
|---|---|
| Пакетный менеджер / оркестрация | pnpm 10 workspaces + Turborepo |
| Рантайм | Node.js 24 LTS (пин: `.node-version`; `engines`/`packageManager` — в скелете) |
| Язык | TypeScript strict (новые дефолты; компилятор tsgo по готовности) |
| Качество | ESLint (с eslint-plugin-boundaries и лимитом размера файлов), Prettier, lint-staged + Husky |
| Scope внутренних пакетов | `@nodus/*` (приватные, `workspace:*`, не публикуются в npm) |

## Фронтенд (`apps/web`)

| Компонент | Выбор | Комментарий |
|---|---|---|
| Фреймворк | React 19 + Vite | SPA. Next.js НЕ используется: портал за логином, SEO не нужен, интерактив решает |
| Стили | Tailwind CSS 4 + shadcn/ui | Своя дизайн-система в `packages/ui`; темы — только дизайн-токенами |
| Серверное состояние | TanStack Query | Оптимистичные мутации — штатный режим (I4) |
| Клиентское состояние | Zustand | Локальное UI-состояние, черновики, presence |
| Формы | react-hook-form + zod | zod-схемы общие с бэкендом через `@nodus/contracts` |
| Роутинг | TanStack Router | Типобезопасный, code-splitting по модулям |
| Моки API | MSW (Mock Service Worker) | Фронт разрабатывается на моках поверх контрактов (ADR-0001) |

## Бэкенд (`apps/api`)

| Компонент | Выбор | Комментарий |
|---|---|---|
| Фреймворк | NestJS 11 (адаптер Fastify) | Модульность из коробки; Fastify — выше throughput |
| ORM / БД | Prisma + PostgreSQL 17 | Миграции, типизация, агенты знают хорошо |
| Кэш / очереди | Redis 7 + BullMQ | Фоновые задачи (превью, отчёты, дайджесты), pub/sub для WS-fanout |
| Доменные события | Redis Streams + таблица `events` в Postgres | Интерфейс EventBus; миграция на NATS позже без смены контрактов (I13) |
| WebSocket | Отдельный процесс `apps/gateway`, Socket.IO | Reconnect, rooms, ack из коробки; stateless |
| Аутентификация (MVP) | Собственная: email+пароль, Argon2id, JWT access (15 мин) + refresh (30 дней, ротация) | Интерфейс `AuthProvider`; Keycloak/LDAP — V2 за тем же интерфейсом |
| Файлы | MinIO (S3 API) + таблица метаданных | Версионирование, превью-конвейер |
| Конвертация превью | Gotenberg (LibreOffice headless) в отдельном контейнере | docx/xlsx/pptx → PDF для просмотрщика |
| Поиск (MVP) | PostgreSQL full-text (русский словарь) | Интерфейс SearchProvider; Meilisearch — V2. Векторный поиск (V3) — за интерфейсом VectorStore: старт на pgvector, переход на Qdrant по триггерам (корпус > 5–10 млн векторов / тяжёлая фильтрация / p95 > 100 мс) |

## Тесты

| Уровень | Инструмент |
|---|---|
| Unit | Vitest |
| E2E (только критичные пути) | Playwright |
| Нагрузочные (перед пилотом) | k6 |

## Инфраструктура и деплой

| Компонент | Выбор |
|---|---|
| Деплой | Docker Compose (одна команда), reverse proxy Caddy с автоматическим TLS |
| Сервисы compose (полный профиль, прод/пилот) | `web, api, gateway, postgres, redis, minio, gotenberg, caddy, clamav, prometheus, grafana` |
| Сервисы compose (dev/демо-профиль) | `web, api, gateway, postgres, redis, minio, gotenberg` **+ `cloudflared`** (туннель к `nodus.by`); `caddy`, `clamav`, `prometheus`, `grafana` подключаются к пилоту (ADR-0002) |
| Среда разработки/демо | домашний сервер + Cloudflare Tunnel, домен `nodus.by` (см. ADR-0002) |
| CI | GitHub Actions: lint → typecheck → test → build |
| ADR | `docs/adr/NNNN-title.md` на каждое архитектурное решение |

## Почему не Go/Rust для бэкенда

На нагрузке 170–2000 пользователей узкое место — SQL и архитектура, а не язык. Единый язык TypeScript (фронт + бэк + контракты) даёт сквозную типизацию и удваивает скорость разработки с ИИ-агентами. Go остаётся опцией для точечных компонентов в будущем (WS-gateway при >50k одновременных соединений) — архитектура это позволяет (I13).
