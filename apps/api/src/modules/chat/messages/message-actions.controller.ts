import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  forwardMessagesBodySchema,
  messagePinSchema,
  messageReactionToggleBodySchema,
  messageSchema,
  paginatedSchema,
  type ChatMessage,
  type ForwardMessagesBody,
  type MessagePin,
  type MessageReactionToggleBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { MessageActionsService } from './message-actions.service.js';
import { MessageDtoMapper } from './message-dto.mapper.js';

const uuidSchema = z.uuid();

/**
 * Действия над сообщениями: закрепы (`/pins`, `/pin`), реакции (toggle),
 * пересылка (`/forward` — цель в пути, источник в теле).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations/:id')
export class MessageActionsController {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly mapper: MessageDtoMapper,
  ) {}

  // ===== Закрепы =====

  @Get('pins')
  @ApiOperation({ summary: 'Лента закрепов беседы (снапшоты сообщений, свежие первыми)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(messagePinSchema) })
  @ApiErrors(400, 401, 404)
  async pins(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
  ): Promise<{ items: MessagePin[]; nextCursor: null }> {
    return { items: await this.actions.listPins(user.id, conversationId), nextCursor: null };
  }

  @Post('messages/:messageId/pin')
  @Audit({ action: 'chat.message_pin', entity: 'message' })
  @ApiOperation({ summary: 'Закрепить (идемпотентно; любое живое сообщение беседы)' })
  @ApiCreatedResponse({ standardSchema: messagePinSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async pin(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
  ): Promise<MessagePin> {
    const { pin, message, members, pinnedByRef } = await this.actions.pin(
      user.id,
      conversationId,
      messageId,
    );
    const dto = await this.mapper.toDto(message, { viewerId: user.id, members });
    return { message: dto, pinnedBy: pinnedByRef, pinnedAt: pin.pinnedAt.toISOString() };
  }

  @Delete('messages/:messageId/pin')
  @HttpCode(204)
  @Audit({ action: 'chat.message_unpin', entity: 'message' })
  @ApiOperation({ summary: 'Открепить (откреп незакреплённого — 404)' })
  @ApiNoContentResponse({ description: 'Откреплено' })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  unpin(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
  ): Promise<void> {
    return this.actions.unpin(user.id, conversationId, messageId);
  }

  // ===== Реакции =====

  @Post('messages/:messageId/reactions')
  @HttpCode(200)
  @Audit({ action: 'chat.reaction_toggle', entity: 'message' })
  @ApiOperation({ summary: 'Toggle своей реакции (remove=true — снять)' })
  @ApiOkResponse({ standardSchema: messageSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async toggleReaction(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
    @Body({
      schema: messageReactionToggleBodySchema,
      pipes: [new ZodValidationPipe(messageReactionToggleBodySchema)],
    })
    dto: MessageReactionToggleBody,
  ): Promise<ChatMessage> {
    const result = await this.actions.toggleReaction(user.id, conversationId, messageId, dto);
    return this.mapper.toDto(result.message, { viewerId: user.id, members: result.members });
  }

  // ===== Пересылка =====

  @Post('forward')
  @Audit({ action: 'chat.message_forward', entity: 'message' })
  @ApiOperation({ summary: 'Пересылка копий в эту беседу (комментарий — перед блоком)' })
  @ApiCreatedResponse({ standardSchema: messageSchema, isArray: true })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async forward(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) conversationId: string,
    @Body({
      schema: forwardMessagesBodySchema,
      pipes: [new ZodValidationPipe(forwardMessagesBodySchema)],
    })
    dto: ForwardMessagesBody,
    @Req() request: FastifyRequest,
  ): Promise<ChatMessage[]> {
    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    const result = await this.actions.forward(user.id, conversationId, dto, key);
    return this.mapper.toDtos(result.rows, { viewerId: user.id, members: result.members });
  }
}
