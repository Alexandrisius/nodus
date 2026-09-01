# syntax=docker/dockerfile:1

# --- Стадия 1: срез монорепо под пакет (turbo prune) ---
FROM node:24-alpine AS pruner
WORKDIR /app
RUN npm install --global turbo@2
COPY . .
RUN turbo prune @nodus/web --docker

# --- Стадия 2: установка зависимостей и сборка SPA ---
FROM node:24-alpine AS builder
WORKDIR /app
RUN npm install --global pnpm@10
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@nodus/web

# --- Стадия 3: раздача статики nginx (прокси /api и /socket.io — см. infra/nginx/web.conf) ---
FROM nginx:1.29-alpine AS runner
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
