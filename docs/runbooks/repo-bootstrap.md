# Runbook: первичная настройка репозитория и среды (repo-bootstrap)

Одноразовая настройка после скелета монорепо (issue #1). Выполняется владельцем репозитория (или агентом с его явного разрешения) — меняет настройки GitHub и Cloudflare.

## 1. Настройки ветвления (ADR-0004)

Только squash-мерж, удаление head-веток после мержа:

```bash
gh api -X PATCH repos/Alexandrisius/nodus \
  -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F allow_squash_merge=true -F delete_branch_on_merge=true
```

## 2. Branch protection на `main`

Включается **после** того, как CI (`.github/workflows/ci.yml`) отработал на `main` хотя бы раз (нужно имя проверки). С этого момента прямые коммиты в `main` закрыты — работа возвращается к PR-флоу (`docs/process/workflow.md`):

```bash
gh api -X PUT repos/Alexandrisius/nodus/branches/main/protection \
  -F required_status_checks[strict]=true \
  -f "required_status_checks[contexts][]=lint → typecheck → test → build" \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f enforce_admins=false \
  -F required_linear_history=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

Проверка: `gh api repos/Alexandrisius/nodus/branches/main/protection --jq '.required_status_checks.contexts'`.

## 3. Dependabot

- Конфиг уже в репозитории (`.github/dependabot.yml`) — PR-ы начнут приходить еженедельно по понедельникам.
- Включить алерты уязвимостей: GitHub → Settings → Code security → **Dependabot alerts** и **Dependabot security updates** — ON.

## 4. Cloudflare Tunnel к `nodus.by` (dev/демо, ADR-0002)

1. Cloudflare Zero Trust → Networks → Tunnels → **Create tunnel** → Cloudflared.
2. Скопировать токен туннеля в `.env` хоста: `NODUS_TUNNEL_TOKEN=...`.
3. Public hostname: `nodus.by` → service `http://nodus_web:80` (HTTP). Один хостнейм достаточно: `/api` и `/socket.io` проксируются nginx внутри web-контейнера.
4. Поднять: `docker compose --profile tunnel up -d`. Проверка: `https://nodus.by/api/v1/health`.

Туннель — только для dev/демо. Прод (пилот, LAN компании) — Caddy по отдельному runbook (к пилоту).

## 5. Локальное окружение разработчика

- Node 24 (`.node-version`), pnpm 10 (`npm i -g pnpm@10`; corepack необязателен).
- `cp .env.example .env` и заполнить пароли — требуется для `docker compose up`.
- Pre-commit хук ставится сам при `pnpm install` (Husky). Скрипты и хуки — всегда LF (см. Gotchas в AGENTS.md).
