---
title: Use Argon2id for Secure Password Hashing
impact: CRITICAL
section: 7
impactDescription: Prevents password leak breaches
tags: auth, security, password-hashing, crypto, argon2, argon2id
---

Storing passwords in plain text is a critical security vulnerability. When a database is compromised, plain text passwords expose users to credential stuffing and account takeover across all services where they reuse passwords. **Never store plain text passwords or use weak hashing.**

> **Hint**: Use the `argon2` npm package (Node.js bindings to the reference Argon2 implementation) in **Argon2id** mode. It generates the salt automatically, stores all parameters inside the PHC hash string, verifies with a constant-time comparison, and can tell you when an old hash should be re-hashed with stronger parameters (`argon2.needsRehash`).

## For AI Agents

When implementing or reviewing password handling, **always** follow these steps:

### Step 1: Check for Plain Text or Weak Hashing
**Pattern to check:** Look for passwords being stored directly or hashed with weak algorithms.

```typescript
// ❌ WRONG - Plain text storage
async register(password: string) {
  return this.authRepository.create({
    email,
    passwordHash: password,  // ❌ Stored as plain text!
  });
}

// ❌ WRONG - Weak hashing (MD5, SHA1, SHA256)
import { createHash } from 'node:crypto';
async hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');  // ❌ Fast, crackable
}

// ❌ WRONG - Manual salt with SHA256
async hashPassword(password: string, salt: string) {
  return createHash('sha256').update(password + salt).digest('hex');  // ❌ Still weak
}

// ✅ CORRECT - Argon2id with automatic salt
import * as argon2 from 'argon2';
async hashPassword(password: string) {
  return argon2.hash(password);  // ✅ Secure, automatic salt, argon2id by default
}
```

**If found:** Replace with `argon2.hash()` / `argon2.verify()`.

### Step 2: Create Password Service
**File:** `src/auth/password.service.ts`

```typescript
// ✅ REQUIRED: Password service wrapping the argon2 package
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Argon2id parameters — RFC 9106 second recommendation
 * (these are also the argon2 package defaults, stated here explicitly
 * so `needsRehash()` compares against the same values).
 *
 * ⚠️ memoryCost is in **KiB**: 65536 KiB = 64 MiB. OWASP minimum is
 * 19456 KiB (19 MiB) / t=2 / p=1 — do not go below that.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // KiB = 64 MiB
  timeCost: 3,       // iterations
  parallelism: 4,    // lanes
} as const;

@Injectable()
export class PasswordService {
  // ✅ Hash with Argon2id; salt is generated and embedded automatically
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  // ✅ Constant-time verification.
  //    NOTE the argument order: the stored hash comes FIRST.
  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  // ✅ True when the stored hash was created with weaker parameters
  //    than ARGON2_OPTIONS (e.g. after we raise the work factors)
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  // ✅ Cryptographically secure token for password-reset flows
  generateSecureToken(length = 32): string {
    return randomBytes(length).toString('hex');
  }
}
```

### Step 3: Use Password Service in AuthService

The service never touches Prisma — user credentials are read/written through the module repository (repository pattern):

```typescript
// ✅ REQUIRED: Hash passwords on registration
@Injectable()
export class AuthService {
  constructor(
    private authRepository: AuthRepository,
    private passwordService: PasswordService,
  ) {}

  async register(dto: RegisterDto) {
    // ✅ Hash password before storing
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.authRepository.create({
      email: dto.email,
      passwordHash,  // ✅ Store the PHC hash, never plain text
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.authRepository.findByEmail(dto.email);

    if (!user) {
      // Mapped to 401 by the global exception filter.
      // Same code as a bad password — never reveal whether the user exists.
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ✅ Constant-time verification (stored hash first!)
    const isValid = await this.passwordService.verify(user.passwordHash, dto.password);

    if (!isValid) {
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    return this.generateTokens(user);
  }
}
```

### Step 4: Add Password Strength Validation
**File:** `packages/contracts/src/auth/register.ts` — one zod schema shared by the web form and the API boundary:

```typescript
// ✅ REQUIRED: Enforce strong passwords (zod, not class-validator)
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters' })
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  });

export const registerSchema = z.object({
  email: z.string().email({ message: 'Please provide a valid email address' }),
  password: passwordSchema,
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
```

The controller validates with the shared schema at the boundary:

```typescript
@Post('register')
@Public()
register(
  @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
) {
  return this.authService.register(dto);
}
```

### Step 5: Implement Password Migration (if needed)

Two migration cases exist, both handled transparently on login (we never know the plain passwords, so we cannot re-hash offline):

```typescript
// ✅ OPTIONAL: Migrate legacy hashes and upgraded parameters on login
@Injectable()
export class PasswordService {
  async verifyAndMigrate(password: string, hash: string): Promise<{
    isValid: boolean;
    needsMigration: boolean;
    newHash?: string;
  }> {
    // Case 1: legacy bcrypt hash imported from an old system
    // (argon2.verify() only understands Argon2 PHC strings)
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      const bcrypt = await import('bcrypt'); // transition-window dependency only
      const isValid = await bcrypt.compare(password, hash);

      if (isValid) {
        const newHash = await this.hash(password); // re-hash with Argon2id
        return { isValid: true, needsMigration: true, newHash };
      }

      return { isValid: false, needsMigration: false };
    }

    // Case 2: Argon2 hash created with outdated parameters
    const isValid = await this.verify(hash, password);
    if (isValid && this.needsRehash(hash)) {
      return { isValid, needsMigration: true, newHash: await this.hash(password) };
    }

    return { isValid, needsMigration: false };
  }
}
```

## Installation

```bash
pnpm add argon2
```

> The package ships prebuilt native binaries; in the Docker image make sure the build stage has the toolchain to compile it if no prebuilt binary matches (or use the official node image where prebuilds exist).

## Quick Reference Checklist

Use this checklist when reviewing or creating password handling:

- [ ] Passwords are never stored in plain text
- [ ] Passwords are hashed with `argon2.hash()` (Argon2id)
- [ ] Passwords are verified with `argon2.verify(hash, password)` — stored hash first
- [ ] `needsRehash()` triggers a transparent re-hash on login after parameter upgrades
- [ ] Passwords have minimum length requirement (12+ characters)
- [ ] Passwords require mixed case, numbers, special characters
- [ ] Password rules live in a zod schema in `@nodus/contracts` (shared front/back)
- [ ] Database column for the hashed password is `TEXT` or `VARCHAR(255)`
- [ ] Error messages don't reveal if user exists
- [ ] Prisma is only called from `*.repository.ts`, never from `AuthService`

**Incorrect:**

```typescript
// auth/auth.service.ts - Insecure 🚨
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class AuthService {
  // ❌ Plain text storage
  async register(email: string, password: string) {
    return this.authRepository.create({
      email,
      passwordHash: password,  // ❌ Stored as-is!
    });
  }

  // ❌ Fast hash (SHA256, MD5) - crackable with GPUs
  async hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  // ❌ Manual salt - still vulnerable to GPU cracking
  async hashWithSalt(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha512')
      .update(password + salt)
      .digest('hex');
    return `${salt}:${hash}`;
  }

  // ❌ Timing-sensitive string comparison
  async verifyPassword(password: string, hash: string) {
    const [salt, originalHash] = hash.split(':');
    const computedHash = createHash('sha512')
      .update(password + salt)
      .digest('hex');
    return computedHash === originalHash;  // ❌ Timing attack vulnerable
  }

  // ❌ Weak password requirements
  // z.string().min(6)  // ❌ Too short!
}
```

**Correct:**

```typescript
// auth/password.service.ts - Secure ✅
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // KiB = 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

@Injectable()
export class PasswordService {
  /**
   * Hash a password with Argon2id.
   * Salt generation and parameter embedding are automatic — the
   * resulting PHC string contains everything verify() needs.
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Verify a password against a stored PHC hash.
   * Constant-time comparison; returns false for invalid hashes too.
   * Argument order: stored hash FIRST, candidate password SECOND.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /**
   * Whether the hash's embedded parameters differ from ARGON2_OPTIONS.
   * Use after successful login to transparently upgrade old hashes.
   */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /**
   * Generate a secure random token for password-reset links.
   */
  generateSecureToken(length = 32): string {
    return randomBytes(length).toString('hex');
  }
}

// auth/auth.service.ts - Secure ✅
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, type RegisterDto, type LoginDto, type ChangePasswordDto } from '@nodus/contracts';
import { DomainException } from '../../core/errors/domain-exception';
import { PasswordService } from './password.service';
import { AuthRepository } from './auth.repository';

@Injectable()
export class AuthService {
  constructor(
    private authRepository: AuthRepository,
    private passwordService: PasswordService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register a new user with secure password hashing
   */
  async register(dto: RegisterDto) {
    // ✅ Check if user exists first
    const existingUser = await this.authRepository.findByEmail(dto.email);

    if (existingUser) {
      // ✅ Generic error - don't reveal if the email is registered
      throw new DomainException(ErrorCode.REGISTRATION_FAILED);
    }

    // ✅ Hash password with Argon2id
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.authRepository.create({
      email: dto.email,
      passwordHash,
    });

    // ✅ Repository returns a safe shape (never includes passwordHash)
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * Login with constant-time password verification
   */
  async login(dto: LoginDto) {
    const user = await this.authRepository.findByEmailWithCredentials(dto.email);

    if (!user) {
      // ✅ Same error code as invalid password - no user enumeration.
      //    (For strict timing equalization, verify against a precomputed
      //    dummy hash here before throwing.)
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ✅ Constant-time password verification
    const isValid = await this.passwordService.verify(user.passwordHash, dto.password);

    if (!isValid) {
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ✅ Transparently upgrade hashes created with weaker parameters
    if (this.passwordService.needsRehash(user.passwordHash)) {
      const newHash = await this.passwordService.hash(dto.password);
      await this.authRepository.updatePassword(user.id, newHash);
    }

    return this.generateTokens(user);
  }

  /**
   * Change password with old password verification
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.authRepository.findByIdWithCredentials(userId);

    if (!user) {
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ✅ Verify old password
    const isValid = await this.passwordService.verify(user.passwordHash, dto.oldPassword);

    if (!isValid) {
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ✅ Hash new password
    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    await this.authRepository.updatePassword(userId, newPasswordHash);

    // TODO: revoke existing refresh tokens / sessions here
  }

  /**
   * Reset password with a secure single-use token.
   * The repository owns the transaction — the service stays Prisma-free.
   */
  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await this.passwordService.hash(newPassword);

    // Validates the token, updates the password and deletes the token
    // atomically; throws DomainException(ErrorCode.INVALID_RESET_TOKEN).
    await this.authRepository.consumeResetToken(token, passwordHash);
  }

  private async generateTokens(user: { id: string; email: string }) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}

// auth/auth.repository.ts — Prisma lives ONLY in *.repository.ts ✅
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DomainException } from '../../core/errors/domain-exception';
import { ErrorCode } from '@nodus/contracts';

@Injectable()
export class AuthRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Consume a password-reset token atomically:
   * validate → update password → delete token, in one transaction.
   */
  async consumeResetToken(token: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { token },
      });

      if (!resetToken || resetToken.expiresAt < new Date()) {
        throw new DomainException(ErrorCode.INVALID_RESET_TOKEN);
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.delete({
        where: { id: resetToken.id },
      });
    });
  }
}
```

```prisma
// prisma/schema.prisma - Correct schema ✅
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   // ✅ Argon2id PHC string (~100 chars) — TEXT/VARCHAR(255) is plenty

  passwordResetTokens PasswordResetToken[]

  // ✅ Unique constraint doubles as the login-lookup index
  @@map("users")
}

model PasswordResetToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@map("password_reset_tokens")
}
```

## Argon2id Parameters and Hash Format

The `argon2` package hashes with Argon2id by default; there is no algorithm switch to configure. What you tune is the work factor:

```typescript
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // KiB — 64 MiB. RFC 9106 recommendation.
  timeCost: 3,       // iterations over the memory
  parallelism: 4,    // lanes/threads
} as const;
```

**Choosing parameters:**
- **RFC 9106 second recommendation** (and the package default): `m=64 MiB, t=3, p=4` — our baseline.
- **OWASP minimum**: `m=19 MiB (19456 KiB), t=2, p=1`. Never go below this.
- ⚠️ **`memoryCost` is in KiB, not MiB** — `memoryCost: 64` would be a 64 **KiB** hash and trivially crackable. This is the single most common configuration mistake.
- Target ~250–500 ms per hash on the production host. Measure with a one-off script after changing parameters; on weak hardware lower `memoryCost` before lowering `timeCost` below 2.
- Higher `memoryCost` is the primary GPU/ASIC resistance factor; `timeCost` multiplies CPU time linearly.

### PHC Hash Format and Parameter Detection

Every hash embeds its algorithm and parameters — no separate columns needed:

```typescript
// PHC string format:
// $argon2id$v=19$m=65536,t=3,p=4$<base64 salt>$<base64 hash>
const hash = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$…';

// ✅ verify() reads parameters from the string itself
await argon2.verify(hash, password);

// ✅ needsRehash() compares embedded parameters with current options —
//    true when we raised memoryCost/timeCost since the hash was created
argon2.needsRehash(hash, ARGON2_OPTIONS);
```

### Upgrading Parameters Without Logging Anyone Out

Parameter upgrades roll out gradually — each hash is upgraded at its owner's next successful login:

```typescript
// ✅ In AuthService.login(), after a successful verify():
if (this.passwordService.needsRehash(user.passwordHash)) {
  const newHash = await this.passwordService.hash(dto.password);
  await this.authRepository.updatePassword(user.id, newHash);
}
```

No batch job, no forced password resets, no downtime.

## Migrating from bcrypt

Relevant when importing users from a legacy system whose hashes are bcrypt (`$2a$`/`$2b$` prefix). `argon2.verify()` only understands Argon2 PHC strings, so the old hashes must be verified with the legacy algorithm during a transition window:

```typescript
// auth/migration/password-migration.service.ts ✅
import { Injectable, Logger } from '@nestjs/common';
import { PasswordService } from '../password.service';
import { AuthRepository } from '../auth.repository';

@Injectable()
export class PasswordMigrationService {
  private readonly logger = new Logger(PasswordMigrationService.name);

  constructor(
    private authRepository: AuthRepository,
    private passwordService: PasswordService,
  ) {}

  /**
   * We cannot re-hash without the plain passwords, so imported users are
   * flagged and migrated one by one at their next successful login.
   */
  async flagLegacyUsers() {
    const users = await this.authRepository.findManyByHashPrefix('$2b$', 100);

    let flagged = 0;

    for (const user of users) {
      try {
        await this.authRepository.setPasswordMigrationFlag(user.id, true);
        this.logger.log(`User ${user.email} will be migrated on next login`);
        flagged++;
      } catch (error) {
        this.logger.error(`Failed to flag user ${user.id}`, error);
      }
    }

    return { flagged, total: users.length };
  }

  /**
   * Called from AuthService.login() when the flag is set
   */
  async migrateOnLogin(user: UserWithCredentials, plainPassword: string): Promise<boolean> {
    if (!user.needsPasswordMigration) {
      return true; // nothing to do — caller proceeds with argon2.verify()
    }

    // Verify with the legacy algorithm first (transition-window dependency)
    const bcrypt = await import('bcrypt');
    const oldHashValid = await bcrypt.compare(plainPassword, user.passwordHash);

    if (!oldHashValid) {
      return false;
    }

    // ✅ Re-hash with Argon2id and clear the flag
    const newHash = await this.passwordService.hash(plainPassword);

    await this.authRepository.updatePassword(user.id, newHash);
    await this.authRepository.setPasswordMigrationFlag(user.id, false);

    this.logger.log(`Migrated password for user ${user.email}`);
    return true;
  }
}
```

Once every active user has logged in (or after a forced reset campaign for stragglers), remove `bcrypt` and the migration code path.

## Security Best Practices

### Password Requirements

```typescript
// packages/contracts/src/auth/password-requirements.ts ✅
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  allowedSpecialChars: '@$!%*?&',
  commonPasswordsBlacklist: [
    'password', '123456', 'qwerty', 'admin', 'welcome',
    // Add more common passwords
  ],
} as const;
```

### Rate Limiting for Auth Endpoints

With the Fastify adapter we use `@fastify/rate-limit` (registered once in `main.ts`), not Express middleware. `max` accepts a function, so auth endpoints get stricter limits without per-route plugin wiring:

```typescript
// main.ts ✅
import fastifyRateLimit from '@fastify/rate-limit';

await app.register(fastifyRateLimit, {
  global: true,
  // Baseline for the whole API; auth endpoints are much stricter
  max: async (request) => {
    const url = request.url;
    if (url.startsWith('/api/v1/auth/login')) return 5;   // 5/min against brute force
    if (url.startsWith('/api/v1/auth/register')) return 3;
    if (url.startsWith('/api/v1/auth/')) return 10;
    return 300;
  },
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip, // requires trustProxy (behind Caddy/CF Tunnel)
  // ✅ Rate-limit errors use the unified API error shape
  errorResponseBuilder: (request, context) => ({
    code: 'RATE_LIMITED',
    message: `Too many requests, retry after ${context.after}`,
    traceId: String(request.id),
  }),
});
```

> The default in-memory store is per-process — fine for our single-instance monolith. If the API ever runs multiple replicas, pass our shared Redis: `redis: ioredisClient`.

### Logging Security Events

```typescript
// auth/auth.service.ts ✅
@Injectable()
export class AuthService {
  async login(dto: LoginDto, ip: string, userAgent: string) {
    const user = await this.authRepository.findByEmailWithCredentials(dto.email);

    const isValid = user
      ? await this.passwordService.verify(user.passwordHash, dto.password)
      : false;

    // ✅ Log failed attempts to the audit log (but never passwords!)
    if (!isValid) {
      await this.auditService.log({
        event: 'auth.login_failed', // module.action naming, like domain events
        email: dto.email,
        ip,
        userAgent,
      });
      throw new DomainException(ErrorCode.INVALID_CREDENTIALS);
    }

    // ... rest of logic
  }
}
```

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Use `argon2.hash()` with Argon2id | Memory-hard, GPU/ASIC-resistant, modern standard |
| Use `argon2.verify(hash, password)` | Constant-time comparison; stored hash comes FIRST |
| Keep parameters in one exported `ARGON2_OPTIONS` | `needsRehash()` compares against the same values |
| Re-hash on login when `needsRehash()` is true | Transparent parameter upgrades, no forced resets |
| `memoryCost` is in KiB | 65536 KiB = 64 MiB; `64` alone would be catastrophically weak |
| Enforce strong passwords via zod in `@nodus/contracts` | One schema shared by web form and API boundary |
| Generic error messages | Prevents user enumeration |
| Never log passwords | Logs can be compromised |
| Rate limit auth endpoints (`@fastify/rate-limit`) | Prevents brute force attacks |
| Prisma only in `*.repository.ts` | Services stay testable and storage-agnostic |
