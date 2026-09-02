---
title: Never Hardcode Secrets - Use Environment Variables
impact: CRITICAL
impactDescription: Prevents credential leaks in source control
section: 9
tags: security, config, environment, secrets, zod, prisma
---

## Never Hardcode Secrets - Use Environment Variables

Hardcoded credentials in source code get committed to git and exposed publicly. The `@nestjs/config` package provides a secure way to manage configuration through environment variables. **Secrets belong in environment only.**

In Nodus the rule is strict: real values live only in `.env` (gitignored), a valueless template lives in `.env.example` (committed), and no secret ever appears in code, docs, or AGENTS.md.

### Installation

```bash
pnpm add @nestjs/config
```

**Incorrect:**

```typescript
// prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({
      datasourceUrl: 'postgres://user:password@localhost:5432/nodus', // 🚨 Exposed!
    });
  }
}

// auth/auth.service.ts
@Injectable()
export class AuthService {
  private readonly jwtSecret = 'my-super-secret-key-12345';  // 🚨 Exposed!
}

// storage/minio.service.ts
const s3 = new S3Client({
  endpoint: 'http://localhost:9000',
  credentials: {
    accessKeyId: 'minioadmin',       // 🚨 Exposed!
    secretAccessKey: 'minioadmin',   // 🚨 Exposed!
  },
});
```

**Correct:**

```typescript
// app.module.ts
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // ✅ Fail fast at bootstrap if any required variable is missing/invalid
      validate: validateEnv,
      cache: true,
    }),
  ],
})
export class AppModule {}

// infra/prisma/prisma.service.ts
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(configService: ConfigService) {
    super({
      datasourceUrl: configService.getOrThrow('DATABASE_URL'),  // ✅ Secure
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}

// auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  private get jwtSecret(): string {
    return this.configService.getOrThrow('JWT_SECRET');  // ✅ Secure
  }
}

// storage/storage.module.ts
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new S3Client({
          endpoint: configService.getOrThrow('MINIO_ENDPOINT'),      // ✅ Secure
          credentials: {
            accessKeyId: configService.getOrThrow('MINIO_ACCESS_KEY'),
            secretAccessKey: configService.getOrThrow('MINIO_SECRET_KEY'),
          },
          region: 'us-east-1', // required by the S3 SDK, unused by MinIO
          forcePathStyle: true,
        }),
    },
  ],
})
export class StorageModule {}
```

## Type-Safe Configuration with zod Validation

We validate environment with **zod** (the same library used for DTOs) via the `validate` hook — no Joi. The app refuses to boot with a clear error listing every problem:

```typescript
// config/env.validation.ts
import { z } from 'zod';

export const envSchema = z.object({
  // Application (system constant — allowed as enum, not a business list)
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database (PostgreSQL 18)
  DATABASE_URL: z.string().url(),

  // Redis 8 (BullMQ, event fanout, rate-limit store)
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // MinIO (self-hosted object storage)
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default('nodus'),

  // Gotenberg (document conversion) — optional in development
  GOTENBERG_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    // ✅ abortEarly: false semantics — report ALL invalid variables at once
    throw new Error(
      `Invalid environment configuration:\n${result.error.message}`,
    );
  }

  return result.data;
}
```

Because `validate` returns the parsed type, `ConfigService` becomes type-safe:

```typescript
import type { Env } from './config/env.validation';

@Injectable()
export class JwtTokensService {
  constructor(private configService: ConfigService<Env, true>) {}

  // ✅ Autocomplete on keys, correct types, never undefined
  private get secret(): string {
    return this.configService.getOrThrow('JWT_SECRET');
  }
}
```

## Custom Configuration with Namespaces

For larger surfaces, `registerAs` groups related values under a typed namespace. It composes with the zod validation above (validation still runs first, at `forRoot`):

```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

// config/jwt.config.ts
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));

// config/redis.config.ts
export default registerAs('redis', () => ({
  url: process.env.REDIS_URL,
}));

// config/index.ts
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import redisConfig from './redis.config';

export default [databaseConfig, jwtConfig, redisConfig];

// app.module.ts
import configs from './config';

ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
  load: configs,
})

// Using in services
@Injectable()
export class TokensService {
  constructor(private configService: ConfigService) {}

  getJwtSecret(): string {
    return this.configService.getOrThrow('jwt.secret');
  }
}
```

> Pick ONE primary style per project and stay consistent: the zod `validate` + `ConfigService<Env, true>` approach is the default in Nodus (single schema, full typing). Add `registerAs` namespaces only if the flat key space gets unwieldy.

## Environment Files: `.env` and `.env.example`

Per project convention:

- **`.env`** — real values for the current environment; **never committed** (gitignored). On the dev/demo host this is also where host-specific **ports** are set, so Nodus containers never collide with the other Docker projects running there (ADR-0002).
- **`.env.example`** — committed template with every key and **no values**; updating it is part of any change that adds a variable.

```bash
# .env (gitignored — real values for this machine only)
NODE_ENV=development
PORT=3100                      # free port on the shared dev host
DATABASE_URL=postgres://nodus:...@localhost:55432/nodus
REDIS_URL=redis://localhost:56379
JWT_SECRET=...                 # ≥ 32 chars, generated per environment
```

## .env.example Template

Always provide a `.env.example` file to document required variables:

```bash
# Application
NODE_ENV=development|production|test
PORT=                          # host port for apps/api (must be free on the host)

# Database (Required) — PostgreSQL 18
DATABASE_URL=

# Redis (Required) — BullMQ / events / rate limit
REDIS_URL=

# JWT (Required - min 32 characters each)
JWT_SECRET=
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d

# MinIO (Required) — self-hosted object storage
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=nodus

# Gotenberg (Optional in development) — document conversion
GOTENBERG_URL=
```

Rules:

- Add a key to `.env.example` **in the same commit** that introduces its use; a missing template entry is a bug (I12 applies to config surface too).
- Never put real values in `.env.example`, docs, tickets, or chat — only in the target machine's `.env`.
- Docker Compose service/network/volume names use the `nodus_` prefix (host is shared); that prefixing lives in `docker-compose.yml`, ports live in `.env`.

## Production Considerations

```typescript
// In production the environment is injected by Docker Compose
// (env_file / environment), so don't read .env files inside the container.
// Validation still runs against process.env.
ConfigModule.forRoot({
  isGlobal: true,
  ignoreEnvFile: process.env.NODE_ENV === 'production',
  validate: validateEnv,
})
```

- Rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` per environment; never reuse the dev secret in production.
- If a secret is ever committed, treat it as compromised: rotate first, then scrub history.
- Logs and the unified error format (`{ code, message, details?, traceId }`) must never include secret values — `details` carries domain data only.
