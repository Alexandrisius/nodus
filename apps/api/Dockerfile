# syntax=docker/dockerfile:1

# --- Стадия 1: срез монорепо под пакет (turbo prune) ---
FROM node:24-alpine AS pruner
WORKDIR /app
RUN npm install --global turbo@2
COPY . .
RUN turbo prune @nodus/api --docker

# --- Стадия 2: установка зависимостей и сборка ---
FROM node:24-alpine AS builder
WORKDIR /app
RUN npm install --global pnpm@10
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@nodus/api

# --- Стадия 3: рантайм ---
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
