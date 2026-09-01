# Runbook: создание GitHub-репозитория и базовый коммит

> **Статус: выполнен (01.09.2026).** Репозиторий `github.com/Alexandrisius/nodus` создан и настроен по этой процедуре. Документ оставлен как протокол и ради раздела «Открытые вопросы» внизу; повторное выполнение не требуется.

Одноразовая процедура. Выполняется один раз по явной команде владельца.

## Цель

Приватный репозиторий `Alexandrisius/nodus` с настроенными labels, milestone и первыми issues — готовый к работе по `docs/process/workflow.md`.

## Предусловия

- `gh` CLI установлен и авторизован (`gh auth status` — аккаунт Alexandrisius).
- Git установлен; локальная папка проекта — `d:\Project\AI\nodus`.

## Шаги

### 1. Первый коммит

```bash
git init
git add -A
git commit -m "chore: фундамент проекта — документация, процессы, навыки (#1)"
```

### 2. Репозиторий

```bash
gh repo create Alexandrisius/nodus --private --source=. --push
```

### 3. Labels (по `docs/process/workflow.md`)

```bash
gh label create "type:feature" --color 0E8A16
gh label create "type:bug" --color D73A4A
gh label create "type:chore" --color 6B7280
gh label create "P0" --color B60205
gh label create "P1" --color D93F0B
gh label create "P2" --color FBCA04
gh label create "area:web" --color 1D76DB
gh label create "area:api" --color 5319E7
gh label create "area:infra" --color 0052CC
gh label create "area:docs" --color 0075CA
```

### 4. Milestone

```bash
gh api repos/Alexandrisius/nodus/milestones -f title="MVP" -f description="Концепт для согласования и пилота (docs/product/vision.md)"
```

### 5. Первые issues (заготовки; планы по фазам — при взятии в работу)

1. **«Скелет монорепо и инфраструктура качества»** (`type:chore`, `area:infra`, P0). Скоуп: pnpm-workspace + turbo + базовые tsconfig; ESLint (boundaries + лимит размера файлов по I5) + Prettier; Husky + lint-staged; `engines`/`packageManager` (Node 24, pnpm 10); `dependabot.yml` (шаблон — правило `security-dependency-audit` навыка `nestjs-best-practices`); CI lint → typecheck → test → build; `docker-compose.yml` (префикс `nodus_`, порты через `.env`, dev-профиль по ADR-0002: web/api/gateway/postgres/redis/minio/gotenberg + cloudflared); `.env.example`. Вне скоупа: core-механизмы и модули (отдельные issues). PR №1 — единственный, который мержится без CI (CI он и добавляет).
2. **«Core: сквозные механизмы»** (`type:feature`, `area:api`, P0). Скоуп: канон `docs/architecture/patterns.md` раздел «Core-примитивы» — DomainException + глобальный фильтр ошибок, ErrorCode/ApiErrorResponse в contracts, TransactionRunner, EventBus + outbox (таблица `events`), ZodValidationPipe, nestjs-pino, аудит- и идемпотентность-интерсепторы, RBAC-гуарды (`@GetUser`, `@RequirePermissions`, PermissionGuard), feature flags, health-checks. **Обязательная сверка:** имена в реализованном коде = имена в навыках `.agents/skills/` (иначе навыки устарели = баг, I12).
3. **«Auth + directory»** (`type:feature`, `area:api`, P0). Логин (argon2id, JWT access/refresh с ротацией), сессии, пользователи/отделы/роли (directory), сидинг по ADR-0002.
4. **«Дизайн-система и каркас UI»** (`type:feature`, `area:web`, P1). `packages/ui` (shadcn/ui, токены, темы), каркас по `docs/product/ux-principles.md` (меню/топбар/слайдеры), TanStack Router, MSW-инфраструктура (ADR-0001), i18n (`packages/contracts/i18n/ru.ts`).

### 6. Branch protection на `main`

Включить **после** появления CI в issue «Скелет»: require PR + require status checks (lint, typecheck, test, build).

```bash
gh api repos/Alexandrisius/nodus/branches/main/protection -X PUT -F required_pull_request_reviews=null -F enforce_admins=false
```

## Проверка результата

- `gh repo view Alexandrisius/nodus` открывается; приватность — Private.
- `gh label list` — 10 labels; `gh issue list` — 4 issues с milestone MVP.
- `git log --oneline` — один коммит; `git status` — чисто.

## Откат

Репозиторий создан ошибочно → `gh repo delete Alexandrisius/nodus --yes` (коммит локальный остаётся, повторить с шага 2).

## Открытые вопросы для первых issues (закрыть при взятии в работу, не блокируют коммит)

- Нумерация задач: глобальная или per-project последовательность, формат номера (бизнес-вопрос владельца).
- Начальная стадия новой задачи и канонический набор стадий дефолтной WorkflowScheme (seed) — бизнес-вопрос.
- Механика идемпотентности: хранение `Idempotency-Key` (таблица/Redis, TTL, scope) — спроектировать в issue «Core», при нетривиальности — ADR.
- Канонический каталог `Permission` (начальный набор) — в issue «Auth + directory».
- Админка статус-схем (WorkflowScheme): владелец редактора — модуль `admin` или `tasks` — уточнить в карте модулей при реализации.
- Виртуализация длинных списков (TanStack Virtual?) — решение при первом тяжёлом списке, зависимость = ADR.
- Связь Task→Letter без cross-module доступа (обработчик `correspondence.resolution_issued`) — спроектировать в issue модуля correspondence.
