# Ловушки (Gotchas)

Каждая ловушка, найденная в работе, добавляется сюда одной строкой в соответствующий раздел **в том же коммите, что и фикс**. Пишем механизм (почему ломается и как обойти), не симптом. Универсальные ловушки хоста (могут сломать любую задачу) дублируются в AGENTS.md — остальное живёт только здесь.

Читать: перед работой в соответствующей области; при непонятной ошибке — свериться сначала здесь.

## Docker и инфраструктура

- На dev-хосте крутятся чужие Docker-проекты: контейнеры/сети/тома Nodus — только с префиксом `nodus_`, порты — через `.env`, перед `docker compose up` проверяй занятые порты (`docker ps`).
- В alpine-контейнерах `localhost` резолвится в ::1 (musl предпочитает AAAA), а наши сервисы слушают IPv4 (`0.0.0.0`) — healthcheck'и docker-compose ходят на `127.0.0.1`, не `localhost`.
- Образ `postgres:18+` ждёт данные в `/var/lib/postgresql`, а не `/var/lib/postgresql/data` — со старым путём контейнер не стартует («unused mount/volume»); новый путь заодно даёт мажорные апгрейды через `pg_upgrade --link`.

## Монорепо и toolchain (pnpm, turbo, TS, ESLint)

- pnpm 11 блокирует install-скрипты зависимостей: пакеты с бинарниками (esbuild, unrs-resolver) — в `allowBuilds` в `pnpm-workspace.yaml`, иначе падают в рантайме с невнятной ошибкой (в pnpm 10 механизм был `onlyBuiltDependencies`).
- pnpm 11 отклоняет зависимости, опубликованные < 24 ч назад (политика `minimumReleaseAge`, анти-supply-chain): свежая версия «не резолвится» — либо ждём окно, либо осознанное исключение в `minimumReleaseAgeExclude` там же.
- Каждый пакет, наследующий пресеты `@nodus/config` (tsconfig/eslint), обязан декларировать его в своих dependencies/devDependencies — pnpm не даёт «соседских» пакетов, `extends` упадёт с «file not found».
- ESLint при явном пути к файлу берёт ближайший к нему `eslint.config.*` (а не корневой): вложенный конфиг `tests/lint/fixtures` не содержит ignores и файлы фикстур линтуются — исключения фильтруются вручную в `lint-staged.config.mjs`.

## Бэкенд (NestJS, Prisma)

- Prisma 7 не загружает `.env` сам: `apps/api/prisma.config.ts` грузит корневой `.env` через dotenv; для CLI-миграций на хосте нужен `DATABASE_URL` в `.env` (в compose api получает свой из environment).
- Генерируемый Prisma client лежит в `apps/api/src/generated/prisma` (не коммитится, eslint-игнор): typecheck/test/build падают на свежем checkout без `pnpm --filter @nodus/api db:generate` — в CI это отдельный шаг после install, в `build` клиент генерируется автоматически.
- Json-полям Prisma `Record<string, unknown>` не назначается напрямую — нужен каст `as Prisma.InputJsonValue` (типы generated client строже входных DTO).
- Vitest (vite 8, rolldown/oxc) не эмитит decorator metadata, нужную Nest DI: тесты, поднимающие Nest-приложение (integration), идут через `unplugin-swc` (`vitest.integration.config.ts`); unit-тесты без декораторов SWC не требуют.
- `@swc/core`, `prisma`, `@prisma/engines` — в `allowBuilds` (pnpm 11): после их обновления проверяй, что pnpm снова не подставил заглушку «set this to true or false».
- Интеграционные тесты используют отдельную БД `nodus_test` (создаётся автоматически, миграции — `migrate deploy`): никогда не направляй их на рабочую `nodus` — очистка таблиц деструктивна.

- `DiscoveryService` (скан провайдеров по метаданным) не глобален: модуль, инжектящий его, обязан импортировать `DiscoveryModule` из `@nestjs/core` — моки в unit-тестах это не ловят, падает только bootstrap контейнера (проверяй `docker compose up` после добавления таких провайдеров).

## Хост разработки (Windows)

- EOL нормализованы `.gitattributes` (всё LF, кроме `*.bat`/`*.cmd`); sh-скрипты и хуки Husky — всегда LF, иначе ломаются в Linux-контейнерах с неочевидной ошибкой.
- `corepack enable` падает без прав на `Program Files` — pnpm ставится через `npm i -g pnpm@11`.
- winget определяет установленные версии по ARP-записям реестра (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`), а не по файлам: установка MSI поверх пакета другого семейства даёт косметический mis-id в `winget list`. Проверяй сами Uninstall-ключи; «призрачную» запись чисти удалением ключа (с export-бэкапом), НЕ `winget uninstall` — тот снесёт файлы актуальной версии по тому же пути.

## Процесс и документация

- ADR нумеруются плотно, без дыр: перед созданием нового — проверь max существующего номера (`ls docs/adr/`), не присваивай «следующий с конца + запас».
- `gh api .../branches/main/protection`: поле `restrictions` обязательно (передавать `-F restrictions=null`), булевы значения — только через `-F` (через `-f` уходит строка и API отвечает 422 «not a boolean»).
