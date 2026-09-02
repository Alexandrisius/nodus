import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 не загружает .env сам; корневой .env монорепо — единая точка секретов.
config({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
