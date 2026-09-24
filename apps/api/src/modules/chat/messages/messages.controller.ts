import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  batchDeleteMessagesBodySchema,
  batchDeleteMessagesResultSchema,
  editMessageBodySchema,
  listMessagesQuerySchema,
  messageSchema,
  paginatedSchema,
  sendMessageBodySchema,
  type BatchDeleteMessagesBody,
  type BatchDeleteMessagesResult,
  type ChatMessage,
  type EditMessageBody,
  type ListMessagesQuery,
  type Paginated,
  type SendMessageBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { MessageDtoMapper } from './message-dto.mapper.js';
import { MessagesService } from './messages.service.js';

const uuidSchema = z.uuid();

/**
 * Сообщения (`/api/v1/chat/conversations/:id/messages`): лента/треды,
 * отправка (идемпотентная), правка, удаление (правило следа), пакетное
 * удаление. Read-эндпоинта НЕТ: курсор прочтения продвигается выдачей (мок).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations/:id/messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly mapper: MessageDtoMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Страница ленты (ASC в странице) или треда (корень первым)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(messageSchema) })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Query({
      schema: listMessagesQuerySchema,
      pipes: [new ZodValidationPipe(listMessagesQuerySchema)],
    })
    query: ListMessagesQuery,
  ): Promise<Paginated<ChatMessage>> {
    return this.messages.list(user.id, conversationId, query);
  }

  @Post()
  @Audit({ action: 'chat.message_send', entity: 'message' })
  @ApiOperation({ summary: 'Отправка: seq+идемпотентность+outbox в одной транзакции' })
  @ApiCreatedResponse({ standardSchema: messageSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async send(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Body({
      schema: sendMessageBodySchema,
      pipes: [new ZodValidationPipe(sendMessageBodySchema)],
    })
    dto: SendMessageBody,
    @Req() request: FastifyRequest,
  ): Promise<ChatMessage> {
    const key = readIdempotencyKey(request);
    const result = await this.messages.send(user.id, conversationId, dto, key);
    return this.mapper.toDto(result.message, {
      viewerId: user.id,
      members: result.members,
    });
  }

  @Patch(':messageId')
  @HttpCode(200)
  @Audit({ action: 'chat.message_edit', entity: 'message' })
  @ApiOperation({ summary: 'Правка текста (только автор; editedAt при реальной смене)' })
  @ApiOkResponse({ standardSchema: messageSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async edit(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
    @Body({
      schema: editMessageBodySchema,
      pipes: [new ZodValidationPipe(editMessageBodySchema)],
    })
    dto: EditMessageBody,
  ): Promise<ChatMessage> {
    const result = await this.messages.edit(user.id, conversationId, messageId, dto.text);
    return this.mapper.toDto(result.message, { viewerId: user.id, members: result.members });
  }

  @Delete(':messageId')
  @Audit({ action: 'chat.message_delete', entity: 'message' })
  @ApiOperation({
    summary: 'Удаление: никто не прочитал — 204 бесследно; хоть один — 200 надгробие',
  })
  @ApiNoContentResponse({ description: 'Удалено бесследно' })
  @ApiOkResponse({ standardSchema: messageSchema, description: 'Надгробие' })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async delete(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ChatMessage | void> {
    const result = await this.messages.delete(user.id, conversationId, messageId);
    if (result.obliterated) {
      void reply.status(204);
      return;
    }
    return this.mapper.toDto(result.message, {
      viewerId: user.id,
      members: result.members,
    });
  }

  @Post('batch-delete')
  @HttpCode(200)
  @Audit({ action: 'chat.message_batch_delete', entity: 'message' })
  @ApiOperation({ summary: 'Пакетное удаление своих (чужие/удалённые пропускаются)' })
  @ApiOkResponse({ standardSchema: batchDeleteMessagesResultSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async batchDelete(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Body({
      schema: batchDeleteMessagesBodySchema,
      pipes: [new ZodValidationPipe(batchDeleteMessagesBodySchema)],
    })
    dto: BatchDeleteMessagesBody,
  ): Promise<BatchDeleteMessagesResult> {
    const result = await this.messages.batchDelete(user.id, conversationId, dto.messageIds);
    const tombstones = await Promise.all(
      result.tombstones.map(({ message, members }) =>
        this.mapper.toDto(message, { viewerId: user.id, members }),
      ),
    );
    return { removed: result.removed, tombstones };
  }
}

/** Читает Idempotency-Key (клиент ставит на каждый POST; иначе — сгенерим). */
function readIdempotencyKey(request: FastifyRequest): string | undefined {
  const header = request.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
}
