import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { createDocsAuthMiddleware, type VerifyAccessToken } from './docs-auth.middleware.js';

/** Путь публикации: UI — `/api/docs`, спека — `/api/docs-json` и `/api/docs-yaml`. */
export const OPENAPI_DOCS_PATH = 'api/docs';
export const OPENAPI_TITLE = 'Nodus API';
export const OPENAPI_VERSION = '0.1.0';

/**
 * Конфигурация документа (единая для генерации и публикации).
 * Безопасность — Bearer (access-JWT); публичные маршруты помечаются `@Public()`
 * и не несут требования безопасности в спеке.
 */
const documentConfig = new DocumentBuilder()
  .setTitle(OPENAPI_TITLE)
  .setDescription(
    'REST API корпоративного портала Nodus. Спецификация генерируется из кода ' +
      '(декораторы контроллеров + zod-схемы @nodus/contracts). Доступ к документации — ' +
      'только для авторизованных (заголовок Authorization: Bearer <access-токен>).',
  )
  .setVersion(OPENAPI_VERSION)
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access-JWT из /api/v1/auth/login',
    },
    'bearer',
  )
  .build();

/** Генерация спецификации из кода (критерий приёмки: без ручного yaml). */
export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, documentConfig);
}

/**
 * Публикация `/api/docs` только для авторизованных (issue #19, I2).
 *
 * Маршруты `SwaggerModule.setup` регистрируются в обход конвейера Nest, поэтому
 * `JwtAuthGuard` их не закрывает — доступ проверяет middie-посредник с той же
 * верификацией access-JWT (см. `docs-auth.middleware.ts`). Вызывается в `main.ts`
 * после регистрации плагинов, до `listen`.
 */
export function setupOpenApi(
  app: NestFastifyApplication,
  verifyAccessToken: VerifyAccessToken,
): void {
  app.use(createDocsAuthMiddleware(verifyAccessToken));
  const document = createOpenApiDocument(app);
  SwaggerModule.setup(OPENAPI_DOCS_PATH, app, document, {
    customSiteTitle: OPENAPI_TITLE,
  });
}
