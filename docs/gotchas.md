# Ловушки (Gotchas)

Каждая ловушка, найденная в работе, добавляется сюда одной строкой в соответствующий раздел **в том же коммите, что и фикс**. Пишем механизм (почему ломается и как обойти), не симптом. Универсальные ловушки хоста (могут сломать любую задачу) дублируются в AGENTS.md — остальное живёт только здесь.

Читать: перед работой в соответствующей области; при непонятной ошибке — свериться сначала здесь.

## Docker и инфраструктура

- На dev-хосте крутятся чужие Docker-проекты: контейнеры/сети/тома Nodus — только с префиксом `nodus_`, порты — через `.env`, перед `docker compose up` проверяй занятые порты (`docker ps`).
- В alpine-контейнерах `localhost` резолвится в ::1 (musl предпочитает AAAA), а наши сервисы слушают IPv4 (`0.0.0.0`) — healthcheck'и docker-compose ходят на `127.0.0.1`, не `localhost`.
- Образ `postgres:18+` ждёт данные в `/var/lib/postgresql`, а не `/var/lib/postgresql/data` — со старым путём контейнер не стартует («unused mount/volume»); новый путь заодно даёт мажорные апгрейды через `pg_upgrade --link`.
- **В runner-стадии Dockerfile глобальных CLI нет** (pnpm ставится только в builder): CMD и seed-скрипты вызывают бинарники из `node_modules/.bin/` пакета (`./node_modules/.bin/prisma migrate deploy`), иначе контейнер рестартит с «pnpm: not found» (подтверждено воспроизведением в issue #3).
- **`prisma db seed` в контейнере не находит tsx на PATH** (pnpm-бины не экспортированы): seed-команда — `node --import tsx prisma/seed.ts`, кроссплатформенно (Windows-хост и alpine-контейнер; подтверждено воспроизведением в issue #3).
- Cloudflare Tunnel после пересоздания web-контейнера теряет origin («connection refused» до переподключения): `docker restart nodus_cloudflared`; проверяй демо curl'ом, а не Invoke-WebRequest (тот капризничает с таймаутами на этой машине).

## Монорепо и toolchain (pnpm, turbo, TS, ESLint)

- pnpm 11 блокирует install-скрипты зависимостей: пакеты с бинарниками (esbuild, unrs-resolver) — в `allowBuilds` в `pnpm-workspace.yaml`, иначе падают в рантайме с невнятной ошибкой (в pnpm 10 механизм был `onlyBuiltDependencies`).
- **`turbo test` включает ВСЕ пакеты workspace с test-скриптом**: новый пакет с особыми рантайм-требованиями (браузеры Playwright в tests/e2e) падает в CI без этих требований — исключать фильтром в корневом скрипте (`turbo test --filter=!@nodus/e2e`), прогон — отдельной командой (`pnpm test:e2e`) и отдельной CI-джобой (подтверждено воспроизведением в issue #3).
- **YAML GitHub Actions: двоеточие+пробел в незакавыченной строке** (`name: E2E (путь: логин)`) — ошибка «workflow file issue» без job-логов, вся джоба молча не стартует; перед пушем workflow-файлов — локальный YAML-парсинг (подтверждено воспроизведением в issue #3).
- **Фоновые процессы в GitHub Actions умирают в конце шага** без `nohup ... > /tmp/x.log 2>&1 &`: «запустил сервер одним шагом, жду другим» падает с connection refused (подтверждено воспроизведением в issue #3).
- **`vite preview`/`vite dev` биндят `localhost`, который может уйти в ::1** (как и alpine-gotcha с musl, но на любой ОС): в CI и скриптах — явный `--host 127.0.0.1`, health-curl на тот же адрес (подтверждено воспроизведением в issue #3).
- pnpm 11 отклоняет зависимости, опубликованные < 24 ч назад (политика `minimumReleaseAge`, анти-supply-chain): свежая версия «не резолвится» — либо ждём окно, либо осознанное исключение в `minimumReleaseAgeExclude` там же.
- Каждый пакет, наследующий пресеты `@nodus/config` (tsconfig/eslint), обязан декларировать его в своих dependencies/devDependencies — pnpm не даёт «соседских» пакетов, `extends` упадёт с «file not found».
- ESLint при явном пути к файлу берёт ближайший к нему `eslint.config.*` (а не корневой): вложенный конфиг `tests/lint/fixtures` не содержит ignores и файлы фикстур линтуются — исключения фильтруются вручную в `lint-staged.config.mjs`.

## Бэкенд (NestJS, Prisma)

- Prisma 7 не загружает `.env` сам: `apps/api/prisma.config.ts` грузит корневой `.env` через dotenv; для CLI-миграций на хосте нужен `DATABASE_URL` в `.env` (в compose api получает свой из environment).
- Генерируемый Prisma client лежит в `apps/api/src/generated/prisma` (не коммитится, eslint-игнор): typecheck/test/build падают на свежем checkout без `pnpm --filter @nodus/api db:generate` — в CI это отдельный шаг после install, в `build` клиент генерируется автоматически.
- Json-полям Prisma `Record<string, unknown>` не назначается напрямую — нужен каст `as Prisma.InputJsonValue` (типы generated client строже входных DTO).
- Vitest (vite 8, rolldown/oxc) не эмитит decorator metadata, нужную Nest DI: тесты, поднимающие Nest-приложение (integration), идут через `unplugin-swc` (`vitest.integration.config.ts`); unit-тесты без декораторов SWC не требуют.
- `@swc/core`, `prisma`, `@prisma/engines` — в `allowBuilds` (pnpm 11): после их обновления проверяй, что pnpm снова не подставил заглушку «set this to true or false».
- **pnpm 11 молча игнорирует поле `pnpm` в package.json** (overrides, allowBuilds, ...): настройки читаются только из `pnpm-workspace.yaml` — overrides в package.json просто не применяются, без предупреждений (подтверждено: pnpm.io/package_json, pnpm.io/migration, PR pnpm/pnpm#10086).
- Интеграционные тесты используют отдельную БД `nodus_test` (создаётся автоматически, миграции — `migrate deploy`): никогда не направляй их на рабочую `nodus` — очистка таблиц деструктивна.

- `DiscoveryService` (скан провайдеров по метаданным) не глобален: модуль, инжектящий его, обязан импортировать `DiscoveryModule` из `@nestjs/core` — моки в unit-тестах это не ловят, падает только bootstrap контейнера (проверяй `docker compose up` после добавления таких провайдеров).
- **Ошибки Fastify-плагинов (например @fastify/rate-limit) — не Nest-исключения**: приходят в глобальный фильтр как объект со `statusCode`, без него ветки фильтра уходят в 500 INTERNAL_ERROR вместо 429. Фильтр обязан иметь ветку для `{ statusCode: number }` (подтверждено воспроизведением в issue #3: e2e получал 500 на rate-limit).
- **`keyGenerator` @fastify/rate-limit выполняется ДО парсинга тела** (`request.body` undefined): per-account лимиты по email через keyGenerator не работают — брутфорс-защита login живёт в AuthService (Redis-счётчик `nodus:auth:login_fail:<email>`), а не в плагине; IP-ключ за NAT офиса блокировал бы всех сотрудников разом (подтверждено воспроизведением: лимит срабатывал с ключом `ip:` при 2 логинах).
- **JWT детерминирован в пределах секунды** (NumericDate = секунды, RFC 7519): два signAsync одного payload в ту же секунду дают идентичный токен — в тестах не сравнивай access-токены на неравенство, проверяй ротацию по refresh-cookie (флаки в integration issue #3).
- Чтение строк, записанных в открытой транзакции, ДОЛЖНО идти через тот же tx-клиент: репозиторный метод `findById` без tx-параметра читает пулом и не видит uncommitted-записей — карточка возвращается со старым состоянием (поймано при реализации directory: `findCardById(id, tx)`).
- **`SwaggerModule.setup` регистрирует маршруты напрямую в HTTP-адаптере** (`httpAdapter.get`), в обход конвейера Nest: глобальные гуарды (наш `JwtAuthGuard`) на `/api/docs` НЕ действуют — документация защищается отдельным middie-посредником (подтверждено: исходники @nestjs/swagger 12, `serveSwaggerUi`/`serveDefinitions`; issue #19).
- **Nest-Fastify передаёт в `app.use`-посредники СЫРЫЕ объекты Node** (`req.raw`, `reply.raw` — см. `fastify-middie.js`: `run(req.raw, reply.raw, next)`), не `FastifyRequest`/`FastifyReply`: `reply.status()` — «not a function»; ответ пишется в `ServerResponse` (`statusCode`/`setHeader`/`end`), `request.id` fastify кладёт на `req.raw` сам (подтверждено исходниками @nestjs/platform-fastify и воспроизведением, issue #19).
- **`@nestjs/swagger` на Fastify требует peer `@fastify/static`**: без него `SwaggerModule.setup` падает «The @fastify/static package is missing» + `process.exit(1)` прямо в bootstrap; версия должна удовлетворять пиру `@nestjs/platform-fastify` (подтверждено воспроизведением, issue #19).
- **`@nestjs/swagger` тянет `@scarf/scarf`** (install-аналитика): в `allowBuilds` — `false` (self-hosted, чужая телеметрия не нужна, I11), build-скрипт не одобрять.
- **Проверка префикса пути по сырому `req.url` обходится одним percent-символом**: роутер Fastify (find-my-way) декодирует путь при матчинге (`safeDecodeURI`), поэтому `/api/%64ocs` минует проверку `startsWith('/api/docs')` и попадает в защищаемый маршрут; путь перед сравнением декодируется один раз (при `URIError` — остаётся сырым: роутер его тоже не матчит). Любой префикс-гуард в посредниках — только после той же нормализации (подтверждено воспроизведением: валидация issue #19 нашла обход `/api/docs*` без токена).

## Хост разработки (Windows)

- **Инструмент `edit` — только после инструмента `read`**: вывод `Get-Content` в консоли Windows показывает UTF-8 файлы мозиброй cp866 (кириллица и эмодзи искажены); скопированный оттуда `oldString` не матчится с точными байтами файла — edit падает «not found». Механизм: консоль Windows рендерит вывод в OEM-кодовой странице локали (для русской — 866; подтверждено: Microsoft Learn, about_Character_Encoding — кодовые страницы консоли/ANSI, плюс воспроизведение в сессии issue #2). Тяжёлые правки кириллических файлов — `write` всего файла.

- EOL нормализованы `.gitattributes` (всё LF, кроме `*.bat`/`*.cmd`); sh-скрипты и хуки Husky — всегда LF, иначе ломаются в Linux-контейнерах с неочевидной ошибкой.
- **Inline-JSON в `curl.exe -d` из PowerShell ломается об экранирование** (`\"` остаётся литеральным → 400 от сервера): тело — из файла (`-d @file.json`) или `Invoke-RestMethod -Body ($obj | ConvertTo-Json)`; ложный «сервер вернул 400» стоил итерации в issue #3 (подтверждено воспроизведением).
- `corepack enable` падает без прав на `Program Files` — pnpm ставится через `npm i -g pnpm@11`.
- winget определяет установленные версии по ARP-записям реестра (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`), а не по файлам: установка MSI поверх пакета другого семейства даёт косметический mis-id в `winget list`. Проверяй сами Uninstall-ключи; «призрачную» запись чисти удалением ключа (с export-бэкапом), НЕ `winget uninstall` — тот снесёт файлы актуальной версии по тому же пути.

## Процесс и документация

- ADR нумеруются плотно, без дыр: перед созданием нового — проверь max существующего номера (`ls docs/adr/`), не присваивай «следующий с конца + запас».
- `gh api .../branches/main/protection`: поле `restrictions` обязательно (передавать `-F restrictions=null`), булевы значения — только через `-F` (через `-f` уходит строка и API отвечает 422 «not a boolean»).
