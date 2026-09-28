import { Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  officeConfigSchema,
  officeSessionQuerySchema,
  officeSessionSchema,
  officeVersionListSchema,
  type OfficeConfig,
  type OfficeSession,
  type OfficeSessionQuery,
  type OfficeVersionList,
} from '@nodus/contracts';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { Public } from '../../../core/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import type { AuthUser } from '@nodus/contracts';
import { FilesRepository } from '../files.repository.js';
import { OFFICE_CONFIG, type OfficeConfig as OfficeEngineConfig } from './office.config.js';
import { OfficeCallbackService, type OfficeCallbackBody } from './office-callback.service.js';
import { OfficeSessionService } from './office-session.service.js';
import { OfficeTokenService } from './office-token.service.js';

const idSchema = z.uuid();

/** Колбэк-тело DS — внешний протокол (не контракт): валидируем свободно. */
const callbackBodySchema = z.object({
  status: z.number().int().min(0).max(10),
  key: z.string().min(1).max(128),
  url: z.string().url().optional(),
  filetype: z.string().optional(),
  users: z.array(z.string()).optional(),
  actions: z.array(z.object({ type: z.number(), userid: z.string() })).optional(),
  lastsave: z.string().optional(),
  forcesavetype: z.number().optional(),
  notmodified: z.boolean().optional(),
  token: z.string().optional(),
});

/**
 * Движок офисного просмотра (#138): конфиг для реестра, сессия документа
 * (JWT-подписанный конфиг DocsAPI) и список версий. Права контекста — I8
 * (владение или контрибьютор FILE_ACCESS, см. OfficeSessionService).
 */
@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class OfficeController {
  constructor(
    private readonly sessions: OfficeSessionService,
    private readonly callback: OfficeCallbackService,
    private readonly tokens: OfficeTokenService,
    private readonly repository: FilesRepository,
    private readonly signedUrls: SignedUrlService,
    @Inject(OFFICE_CONFIG) private readonly engineConfig: OfficeEngineConfig,
  ) {}

  /**
   * Параметры движка — @Public (как health): не раскрывают пользователей,
   * нужны реестру до/вне сессии (иначе запрос на буте до логина кэшировал
   * бы «движок выключен»). Сессии и версии — под авторизацией.
   */
  @Public()
  @Get('office-config')
  @ApiOperation({ summary: 'Параметры движка офисного просмотра (фолбэки реестра)' })
  @ApiOkResponse({ standardSchema: officeConfigSchema })
  async config(): Promise<OfficeConfig> {
    return {
      enabled: this.engineConfig.enabled,
      editEnabled: this.engineConfig.editEnabled,
      maxViewBytes: this.engineConfig.maxViewBytes,
    };
  }

  @Get(':id/office-session')
  @ApiOperation({ summary: 'Сессия документа ONLYOFFICE (JWT-конфиг DocsAPI)' })
  @ApiOkResponse({ standardSchema: officeSessionSchema })
  @ApiErrors(400, 401, 403, 404, 410, 413)
  async session(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) fileId: string,
    @Query({
      schema: officeSessionQuerySchema,
      pipes: [new ZodValidationPipe(officeSessionQuerySchema)],
    })
    query: OfficeSessionQuery,
  ): Promise<OfficeSession> {
    return this.sessions.createSession(fileId, user, query.mode);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Версии файла (сохранения ONLYOFFICE), новые сверху' })
  @ApiOkResponse({ standardSchema: officeVersionListSchema })
  @ApiErrors(401, 404)
  async versions(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) fileId: string,
  ): Promise<OfficeVersionList> {
    const { file } = await this.sessions.resolveAccess(fileId, user.id);
    const rows = await this.repository.findVersions(file.id);
    return {
      items: rows.map((row) => ({
        version: row.version,
        size: row.size,
        mime: row.mime,
        createdAt: row.createdAt.toISOString(),
        url: this.signedUrls.fileVersionUrl(file.id, row.version),
      })),
    };
  }

  /**
   * Колбэк сохранений документ-сервера (#138): @Public — вызывает DS
   * (Bearer JWT общего секрета вместо пользовательской сессии; JWT_IN_BODY
   * у DS выключен — токен в Authorization). Идемпотентность не через
   * Idempotency-Key (DS его не шлёт), а по document key + lastsave в
   * сервисе. Ответ `{ error: 0 }` — протокол DS; 5xx заставляет DS
   * повторить доставку (желательно для транзиентных сбоев скачивания).
   */
  @Public()
  @Post(':id/office-callback')
  @ApiOperation({ summary: 'Callback сохранений ONLYOFFICE (внутренний, для DS)' })
  async officeCallback(
    @Param('id', new ZodValidationPipe(idSchema)) fileId: string,
    @Req() request: FastifyRequest,
  ): Promise<{ error: number }> {
    const body: OfficeCallbackBody = callbackBodySchema.parse(request.body);
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    // DS подписывает исходящие запросы как { payload: <тело> } тем же секретом
    // (api.onlyoffice.com/docs/docs-api/additional-api/signature/request/).
    const decoded = await this.tokens.verify(bearer ?? body.token);
    const inner = decoded?.payload as { key?: string } | undefined;
    if (!decoded || !inner || inner.key !== body.key) {
      throw DomainException.unauthenticated('Document server token is invalid');
    }
    await this.callback.handle(fileId, body);
    return { error: 0 };
  }
}
