# ADR-0006. OpenAPI из кода: @nestjs/swagger + нативный Standard Schema (zod 4)

- **Статус:** Принят
- **Дата:** 2026-09-02
- **Контекст:** issue #19 — инвариант I2 требует спецификацию, генерируемую из кода, на `/api/docs` только для авторизованных.

## Контекст

Все контракты проекта — zod-схемы в `@nodus/contracts` (ADR-0001): ими валидируется вход (`ZodValidationPipe`), типизируются фронт и бэк. Классических DTO-классов с декораторами `@ApiProperty` в проекте нет и не будет — дублирование схем ради документации создало бы второй источник истины с гарантированным дрейфом. Значит, мост zod → OpenAPI обязателен, и вопрос только в его реализации. Дополнительное ограничение: маршруты `SwaggerModule.setup` регистрируются напрямую в HTTP-адаптере (`httpAdapter.get`), минуя конвейер Nest, — глобальный `JwtAuthGuard` на `/api/docs` не действует (подтверждено исходниками `@nestjs/swagger`: `serveSwaggerUi`/`serveDefinitions`).

## Решение

1. **`@nestjs/swagger` 12** (peer к NestJS 12) — генерация документа из декораторов контроллеров и публикация `/api/docs` (UI, `-json`, `-yaml`).
2. **Нативная конверсия Standard Schema — без дополнительных зависимостей.** Тело и query: опция `schema` декораторов маршрута (`@Body({ schema: loginSchema, pipes: [...] })`); ответы: `standardSchema` в `@ApiOkResponse`/`@ApiCreatedResponse`/… `@nestjs/swagger` 12 сам вызывает `schema['~standard'].jsonSchema.{input|output}({ target: 'openapi-3.0' })` — zod 4 реализует это расширение (проверено на 4.5.4). Вход документируется входной стороной схемы, ответы — выходной (после `default`/коэрции).
3. **Валидация не меняется**: остаётся `ZodValidationPipe` (единый формат `VALIDATION_FAILED`); опция `schema` на рантайм не влияет (`StandardSchemaValidationPipe` Nest не подключается).
4. **Защита `/api/docs*`** — middie-посредник, зарегистрированный до `SwaggerModule.setup`: проверяет тот же access-JWT через `TokenService`, отказ — единым форматом `401 UNAUTHENTICATED`. На Fastify посредник получает СЫРЫЕ объекты Node (`req.raw`/`reply.raw`) — ответ пишется в `ServerResponse`.
5. **Общие декораторы** — `core/openapi/api-errors.decorator.ts` (`@ApiErrors(400, 401, …)` с `apiErrorResponseSchema`) и `api-idempotency.decorator.ts` (`@ApiIdempotencyKey()`).

## Альтернативы

| Альтернатива | Почему отклонена | Когда пересмотреть |
|---|---|---|
| `zod-openapi` / конвертер в `SwaggerDocumentOptions` (пример из официальных доков) | Избыточно: наш zod реализует `~standard.jsonSchema`, конвертер не нужен; ещё одна зависимость в рантайме | Если нативная конверсия перестанет покрывать схемы (например, сложные `transform`) или понадобится тоньше управлять выводом |
| `nestjs-zod` / `zod-nest` | Тянут параллельную экосистему (свои пайпы, `createZodDto`, постпроцессоры `cleanupOpenApiDoc`/`applyZodNest`), конфликтуют с принятым `ZodValidationPipe` и канонами patterns.md | Если Nest уберёт нативную Standard Schema-поддержку |
| Ручные `SchemaObject` в `@ApiBody`/`@ApiResponse` | Дублирование контрактов, дрейф схем | Никогда |
| Классические DTO-классы с `@ApiProperty` | Противоречит ADR-0001 (zod — единственный источник типов) | Никогда |
| Публикация спеки отдельным скриптом/файлом | Нарушение I2 «из кода» + ручной шаг в CI | Никогда |

## Последствия

- Проще: одна схема = валидация + типы + документация; новый эндпоинт документируется теми же строками, что и валидируется (правило — `patterns.md`, «OpenAPI-аннотации»).
- Сложнее: аннотации требуют `emitDecoratorMetadata` (tsc/SWC) — в unit-тестах без SWC документ не собрать (тесты спеки живут под интеграционной конфигурацией); маршруты документации идут в обход гуардов/интерцепторов (аудит на них не пишется — осознанно: это не доменные действия).
- Риск: качество вывода зависит от конверсии zod → JSON Schema (паттерны `z.uuid()`/`z.email()` попадают в спеку как есть — многословно, но корректно). Снимается тем же механизмом `standardSchemaConverter`, если понадобится.

## Обоснование (research)

- Официальные доки Nest «OpenAPI → Standard Schema» (docs.nestjs.com/openapi/introduction): `schema`-опция декораторов маршрута, `standardSchemaConverter`, `~standard.jsonSchema` как нативный путь.
- Исходники `@nestjs/swagger` 12.0.1: `standard-schema-openapi.converter.js` (нативная конверсия, `target: 'openapi-3.0'`), `response-object-factory.js` (`standardSchema` → output-вариант), `parameter-metadata-accessor.js` (чтение `schema` из метаданных маршрута), `swagger-module.js` (регистрация маршрутов через `httpAdapter.get` — в обход гуардов).
- Проверка на рантайме: `z.object(...)['~standard'].jsonSchema` присутствует начиная с zod 4.x (проверено 4.5.4); вывод для рекурсивных схем (`z.lazy`), `nullable`, `default`, коэрции — корректный OpenAPI 3.0.
- Exa-обзор экосистемы (09.02): `nestjs-zod` (BenLorantfy), `zod-nest`, `nestjs-zod-openapi` — все строятся поверх чужих пайпов/постпроцессоров; нативный путь — единственный без новых зависимостей.
