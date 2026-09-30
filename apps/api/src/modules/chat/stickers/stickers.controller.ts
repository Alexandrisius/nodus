import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import {
  createStickerPackBodySchema,
  ErrorCode,
  Permission,
  renameStickerPackBodySchema,
  stickerPackListSchema,
  stickerPackSchema,
  type CreateStickerPackBody,
  type RenameStickerPackBody,
  type StickerPack,
  type StickerPackList,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import type { AuthUser } from '@nodus/contracts';
import { StickersService } from './stickers.service.js';

const uuidSchema = z.uuid();

/** Право управления корпоративными паками — из JWT (I8: гейт в сервисах —
 *  условие зависит от scope тела, декоратор маршрута не подходит). */
function canManageCorporate(user: AuthUser): boolean {
  return user.permissions.includes(Permission.STICKER_MANAGE);
}

/** Поля multipart-загрузки стикера: emojis — JSON-строка массива (1–3);
 *  size — заявленный размер (потолок проверяется по байтам), width/height —
 *  габариты от клиента (резерв бокса); previewUrl — мок-поле, игнорируется. */
const uploadFieldsSchema = z.object({
  emojis: z.string(),
  size: z.coerce.number().int().min(0),
  // Габариты — подсказка резерва бокса: clamp отсеивает ложные значения
  // (хоть 100000px), декодирования пикселей на сервере нет (граница #143).
  width: z.coerce.number().int().min(1).max(2048).optional(),
  height: z.coerce.number().int().min(1).max(2048).optional(),
});

const emojisSchema = z.array(z.string().min(1)).min(1).max(3);

/**
 * Стикер-паки (`/api/v1/chat/stickers`): списки/детали, CRUD пака,
 * multipart-загрузка стикеров, установка/снятие «себе». Стикер-сообщение
 * отправляется обычным POST messages со stickerId (#143).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/stickers')
export class StickersController {
  constructor(private readonly stickers: StickersService) {}

  @Get('packs')
  @ApiOperation({ summary: 'Мои паки: корпоративные + свои + установленные (со стикерами)' })
  @ApiOkResponse({ standardSchema: stickerPackListSchema })
  @ApiErrors(401, 403)
  list(@GetUser() user: { id: string }): Promise<StickerPackList> {
    return this.stickers.list(user.id);
  }

  @Get('packs/:id')
  @ApiOperation({ summary: 'Деталь пака (поповер из чата; пак может быть не в «моих»)' })
  @ApiOkResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404)
  get(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
  ): Promise<StickerPack> {
    return this.stickers.get(user.id, packId);
  }

  @Post('packs')
  @Audit({ action: 'chat.sticker_pack_create', entity: 'sticker_pack' })
  @ApiOperation({ summary: 'Создание пака (corporate — право sticker.manage)' })
  @ApiCreatedResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403)
  @ApiIdempotencyKey()
  create(
    @GetUser() user: AuthUser,
    @Body({
      schema: createStickerPackBodySchema,
      pipes: [new ZodValidationPipe(createStickerPackBodySchema)],
    })
    dto: CreateStickerPackBody,
  ): Promise<StickerPack> {
    return this.stickers.create(user.id, canManageCorporate(user), dto);
  }

  @Patch('packs/:id')
  @Audit({ action: 'chat.sticker_pack_rename', entity: 'sticker_pack' })
  @ApiOperation({ summary: 'Переименование пака (владелец/админ)' })
  @ApiOkResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  rename(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
    @Body({
      schema: renameStickerPackBodySchema,
      pipes: [new ZodValidationPipe(renameStickerPackBodySchema)],
    })
    dto: RenameStickerPackBody,
  ): Promise<StickerPack> {
    return this.stickers.rename(user.id, canManageCorporate(user), packId, dto.title);
  }

  @Delete('packs/:id')
  @HttpCode(204)
  @Audit({ action: 'chat.sticker_pack_delete', entity: 'sticker_pack' })
  @ApiOperation({ summary: 'Удаление пака «для всех» (soft; сообщения рендерятся дальше)' })
  @ApiNoContentResponse()
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async remove(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
  ): Promise<void> {
    await this.stickers.delete(user.id, canManageCorporate(user), packId);
  }

  @Post('packs/:id/stickers')
  @Audit({ action: 'chat.sticker_upload', entity: 'sticker' })
  @ApiOperation({
    summary: 'Загрузка стикера (multipart: emojis/size/width/height ДО file; magic bytes)',
  })
  @ApiCreatedResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404, 413)
  @ApiIdempotencyKey()
  async upload(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
    @Req() request: FastifyRequest,
  ): Promise<StickerPack> {
    // Контракт @fastify/multipart (gotcha #57): текстовые поля ДО файла.
    const parts = request.parts();
    const fields: Record<string, string> = {};
    let file: MultipartFile | null = null;
    for await (const part of parts) {
      if (part.type === 'file') {
        file = part;
        break;
      }
      if (part.fieldname in fields) continue; // дубль имени — берём первое
      fields[part.fieldname] = String(part.value);
    }
    if (!file) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'multipart/form-data with a file part is required',
      );
    }
    const parsed = uploadFieldsSchema.safeParse(fields);
    let emojis: string[] | null = null;
    if (parsed.success) {
      try {
        emojis = emojisSchema.parse(JSON.parse(parsed.data.emojis));
      } catch {
        emojis = null;
      }
    }
    if (!parsed.success || !emojis) {
      file.file.resume(); // стрим не потреблён — сброс, иначе соединение висит
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        issues: [{ path: 'emojis', code: 'invalid', message: 'emojis: JSON array of 1-3 strings' }],
      });
    }
    // Сервис валидирует права/лимиты ДО чтения стрима: отказ (403/404/413)
    // оставляет поток непотреблённым — resume(), иначе соединение виснет
    // на больших телах (класс gotcha #57, образец — attachments.controller).
    try {
      return await this.stickers.uploadSticker(
        user.id,
        canManageCorporate(user),
        packId,
        {
          emojis,
          size: parsed.data.size,
          width: parsed.data.width,
          height: parsed.data.height,
        },
        file.file,
      );
    } catch (error) {
      file.file.resume();
      throw error;
    }
  }

  @Delete('stickers/:id')
  @Audit({ action: 'chat.sticker_remove', entity: 'sticker' })
  @ApiOperation({ summary: 'Убрать стикер из пака (владелец/админ)' })
  @ApiOkResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  removeSticker(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) stickerId: string,
  ): Promise<StickerPack> {
    return this.stickers.removeSticker(user.id, canManageCorporate(user), stickerId);
  }

  @Post('packs/:id/install')
  @Audit({ action: 'chat.sticker_pack_install', entity: 'sticker_pack' })
  @ApiOperation({ summary: 'Добавить пак себе («из чата»); идемпотентно' })
  @ApiCreatedResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  install(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
  ): Promise<StickerPack> {
    return this.stickers.install(user.id, packId);
  }

  @Delete('packs/:id/install')
  @Audit({ action: 'chat.sticker_pack_uninstall', entity: 'sticker_pack' })
  @ApiOperation({ summary: 'Убрать пак из своих' })
  @ApiOkResponse({ standardSchema: stickerPackSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  uninstall(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) packId: string,
  ): Promise<StickerPack> {
    return this.stickers.uninstall(user.id, packId);
  }
}
