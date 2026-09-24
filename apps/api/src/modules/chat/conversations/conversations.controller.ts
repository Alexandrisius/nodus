import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  conversationDraftSchema,
  conversationListItemSchema,
  createConversationBodySchema,
  listConversationsQuerySchema,
  paginatedSchema,
  saveConversationDraftBodySchema,
  conversationUpdateBodySchema,
  type ConversationDraft,
  type ConversationListItem,
  type ConversationUpdateBody,
  type CreateConversationBody,
  type ListConversationsQuery,
  type Paginated,
  type SaveConversationDraftBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { ConversationsService } from './conversations.service.js';

const uuidSchema = z.uuid();

/**
 * Беседы (`/api/v1/chat/conversations`): список, создание, find-or-create
 * direct, персональные настройки списка, черновики. Модуль за фичефлагом
 * `chat` (I10): выключен — маршрутов «нет» (404).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Список бесед пользователя (курсор + search)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(conversationListItemSchema) })
  @ApiErrors(400, 401)
  list(
    @GetUser() user: { id: string },
    @Query({
      schema: listConversationsQuerySchema,
      pipes: [new ZodValidationPipe(listConversationsQuerySchema)],
    })
    query: ListConversationsQuery,
  ): Promise<Paginated<ConversationListItem>> {
    return this.conversations.list(user.id, query);
  }

  @Post()
  @Audit({ action: 'chat.conversation_create', entity: 'conversation' })
  @ApiOperation({ summary: 'Создание группы/канала (создатель — owner)' })
  @ApiCreatedResponse({ standardSchema: conversationListItemSchema })
  @ApiErrors(400, 401)
  @ApiIdempotencyKey()
  create(
    @GetUser() user: { id: string },
    @Body({
      schema: createConversationBodySchema,
      pipes: [new ZodValidationPipe(createConversationBodySchema)],
    })
    dto: CreateConversationBody,
  ): Promise<ConversationListItem> {
    return this.conversations.create(user.id, dto);
  }

  @Get('direct/:userId')
  @ApiOperation({ summary: 'Find-or-create личной беседы (включая «Заметки»)' })
  @ApiOkResponse({ standardSchema: conversationListItemSchema, description: 'Существующая беседа' })
  @ApiCreatedResponse({
    standardSchema: conversationListItemSchema,
    description: 'Создана (201 — мок-контракт)',
  })
  @ApiErrors(400, 401, 404)
  async findDirect(
    @GetUser() user: { id: string },
    @Param('userId', new ZodValidationPipe(uuidSchema)) peerId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ConversationListItem> {
    const { item, created } = await this.conversations.findOrCreateDirect(user.id, peerId);
    if (created) void reply.status(201);
    return item;
  }

  @Patch(':id')
  @HttpCode(200)
  @Audit({ action: 'chat.conversation_patch', entity: 'conversation' })
  @ApiOperation({ summary: 'Персональные настройки: pinned/muted/snoozed/hidden' })
  @ApiOkResponse({ standardSchema: conversationListItemSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  patch(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body({
      schema: conversationUpdateBodySchema,
      pipes: [new ZodValidationPipe(conversationUpdateBodySchema)],
    })
    dto: ConversationUpdateBody,
  ): Promise<ConversationListItem> {
    return this.conversations.patch(user.id, id, dto);
  }

  @Put(':id/draft')
  @HttpCode(200)
  @Audit({ action: 'chat.draft_save', entity: 'conversation' })
  @ApiOperation({ summary: 'Сохранение черновика (пустой текст = удаление)' })
  @ApiOkResponse({
    standardSchema: conversationDraftSchema.nullable(),
    description: 'Черновик; null — очищен',
  })
  @ApiErrors(400, 401, 404)
  @ApiIdempotencyKey()
  draft(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body({
      schema: saveConversationDraftBodySchema,
      pipes: [new ZodValidationPipe(saveConversationDraftBodySchema)],
    })
    dto: SaveConversationDraftBody,
  ): Promise<ConversationDraft | null> {
    return this.conversations.putDraft(user.id, id, dto.text);
  }
}
