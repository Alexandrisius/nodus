---
title: Generate Swagger/OpenAPI Documentation
impact: MEDIUM
section: 8
impactDescription: Enables automatic API documentation and client generation
tags: documentation, swagger, openapi, api
---

## Generate Swagger/OpenAPI Documentation

Недокументированный API заставляет клиентов угадывать эндпоинты и форматы. Спецификация
генерируется `@nestjs/swagger` из кода и публикуется на `/api/docs` только для авторизованных
(канон — `docs/architecture/patterns.md` «OpenAPI-аннотации», решение — ADR-0006).
**Каждый новый/изменённый эндпоинт документируется в том же коммите.**

Источник схем — **те же zod-схемы `@nodus/contracts`**, что валидируют вход: одна схема =
валидация + типы + документация. Классические DTO с `@ApiProperty` запрещены (противоречит
ADR-0001 — zod единственный источник типов).

**Неправильно (дубль схемы / ручные ответы / классы):**

```typescript
// 🚨 DTO-класс дублирует zod-схему контрактов — дрейф гарантирован
export class CreateUserDto {
  @ApiProperty() email: string;
}

// 🚨 ответ описан словами, без схемы из контракта
@ApiResponse({ status: 201, description: 'User created', type: CreateUserDto })
create(@Body() dto: CreateUserDto) { … }
```

**Правильно (спека собирается из контрактов):**

```typescript
@ApiTags('directory')
@ApiBearerAuth() // контроллер под JWT; публичные маршруты — @Public() и без него
@Controller('directory/users')
export class UsersController {
  @Post()
  @ApiOperation({ summary: 'Создание сотрудника' })
  @ApiCreatedResponse({ standardSchema: userCardSchema }) // ответ — выходная сторона схемы
  @ApiErrors(400, 401, 403, 409) // ошибки единого формата (общая схема)
  @ApiIdempotencyKey() // мутация → заголовок идемпотентности
  create(
    // schema — документация (нативный Standard Schema), pipes — валидация единым форматом
    @Body({ schema: createUserSchema, pipes: [new ZodValidationPipe(createUserSchema)] })
    dto: CreateUserDto,
  ) { … }

  @Get()
  @ApiOkResponse({ standardSchema: paginatedSchema(userListItemSchema) }) // канон { items, nextCursor }
  list(
    @Query({ schema: listUsersQuerySchema, pipes: [new ZodValidationPipe(listUsersQuerySchema)] })
    q: ListUsersQuery,
  ) { … }
}
```

Ключевые правила:

- Тело/параметры — опция `schema` у `@Body`/`@Query` (рядом `pipes` с `ZodValidationPipe`); ответы — `standardSchema` у `@Api…Response`. Конвертирует сам `@nestjs/swagger` (вход — `input`, ответы — `output`), дополнительные библиотеки не нужны (ADR-0006).
- Ошибки — только `@ApiErrors(400, 401, …)` (`core/openapi/api-errors.decorator.ts`), не расписывать каждый код вручную.
- Мутации (POST/PUT/PATCH/DELETE) — `@ApiIdempotencyKey()` (`core/openapi/api-idempotency.decorator.ts`); чтение — нет.
- Подключение — `setupOpenApi(app, verify)` в `main.ts`; `/api/docs*` закрыт middie-посредником (`docs-auth.middleware.ts`), т.к. маршруты документации регистрируются в обход гуардов.
- Проверка: `test/integration/openapi.integration.test.ts` (запуск под SWC — нужна рефлексия метаданных); локально — `GET /api/docs` с токеном.
