---
title: Keep Functions Short and Single Purpose
impact: MEDIUM
section: 3
impactDescription: Improves testability and reduces bugs
tags: code-quality, functions, SRP, maintainability
---

## Keep Functions Short and Single Purpose

Long functions with multiple responsibilities are hard to test, debug, and maintain. Short functions (<20 lines) with one clear purpose are easier to understand. **Extract logic into focused helper functions.**

Typical extraction signals in a Nodus module:

- Boundary validation → the zod pipe (contracts schema), never inline in the handler
- Persistence details → the module's `*.repository.ts`, never inline Prisma
- Cross-module side effects → an outbox event, never an inline call to another module
- Crypto, mapping, formatting → a private helper with one job

**Incorrect (god function):**

```typescript
@Post()
async createUser(@Body() data: any) {              // ❌ no zod validation at the boundary
  // 4 responsibilities mixed 🚨
  const passwordHash = await argon2.hash(data.password);
  const user = await this.prisma.user.create({     // ❌ Prisma outside the repository
    data: { ...data, passwordHash },
  });
  await this.emailService.sendWelcome(user.email); // ❌ inline cross-module side effect
  return { success: true, data: user };            // ❌ wrapper is not our response format
}
```

**Correct (single responsibility):**

```typescript
// users.controller.ts — thin handler: pipe → service → response
@Post()
create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
  return this.usersService.create(dto);
}

// users.service.ts — orchestration only; every concern is a focused helper
async create(dto: CreateUserDto) {
  const passwordHash = await this.hashPassword(dto.password);

  return this.prisma.$transaction(async (tx) => {
    const user = await this.usersRepository.create(tx, { ...dto, passwordHash });
    await this.publishUserCreated(tx, user);   // welcome email is a subscriber, not a dependency
    return user;
  });
}

private hashPassword(password: string): Promise<string> {
  // ✅ Argon2id via the argon2 package — one job, one line of intent
  return argon2.hash(password, { type: argon2.argon2id });
}

private publishUserCreated(tx: Prisma.TransactionClient, user: User) {
  // ✅ Outbox event in the same transaction as the state change (I9)
  return this.eventBus.emit(tx, DIRECTORY_EVENTS.USER_CREATED, {
    userId: user.id,
    email: user.email,
    name: user.name,
  });
}
```

Each extracted helper is now unit-testable in isolation (hashing, mapping, event payload), and the orchestrating method reads as a table of contents for the use case.
