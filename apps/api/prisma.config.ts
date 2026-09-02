import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 не загружает .env сам; корневой .env монорепо — единая точка секретов.
config({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Демо-оргструктура (ADR-0002): идемпотентный upsert-сеед.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` не коннектится к БД, но config обязан содержать url —
    // в docker build (без .env) подставляется заглушка. Миграции требуют
    // реальный DATABASE_URL (из .env на хосте / env в CI) и на заглушке упадут.
    url:
      process.env.DATABASE_URL ??
      'postgresql://generate-only:generate-only@localhost:5432/generate-only',
  },
});
