import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addConversationMembersBodySchema,
  conversationListItemSchema,
  conversationMemberSchema,
  listConversationMembersQuerySchema,
  paginatedSchema,
  updateConversationMemberBodySchema,
  type AddConversationMembersBody,
  type ConversationListItem,
  type ConversationMember,
  type ListConversationMembersQuery,
  type Paginated,
  type UpdateConversationMemberBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { ConversationMembersService } from './conversation-members.service.js';

const uuidSchema = z.uuid();

/**
 * Участники беседы (`/api/v1/chat/conversations/:id/members`, #186): список
 * с ролями и поиском, добавление (addMembers), смена роли модератора
 * (manageSettings), исключение (removeMembers). Права — матрица беседы на
 * гвардах сервиса (I8); модуль за фичефлагом `chat` (I10).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations')
export class ConversationMembersController {
  constructor(private readonly members: ConversationMembersService) {}

  @Get(':id/members')
  @ApiOperation({ summary: 'Участники беседы с ролями (курсор + поиск)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(conversationMemberSchema) })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query({
      schema: listConversationMembersQuerySchema,
      pipes: [new ZodValidationPipe(listConversationMembersQuerySchema)],
    })
    query: ListConversationMembersQuery,
  ): Promise<Paginated<ConversationMember>> {
    return this.members.list(user.id, id, query);
  }

  @Post(':id/members')
  @HttpCode(200)
  @Audit({ action: 'chat.members_add', entity: 'conversation' })
  @ApiOperation({ summary: 'Добавление участников (право addMembers)' })
  @ApiOkResponse({ standardSchema: conversationListItemSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  add(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body({
      schema: addConversationMembersBodySchema,
      pipes: [new ZodValidationPipe(addConversationMembersBodySchema)],
    })
    dto: AddConversationMembersBody,
  ): Promise<ConversationListItem> {
    return this.members.add(user.id, id, dto);
  }

  @Patch(':id/members/:userId')
  @HttpCode(200)
  @Audit({ action: 'chat.member_role_change', entity: 'conversation' })
  @ApiOperation({ summary: 'Смена роли участника: модератор ⇄ участник (manageSettings)' })
  @ApiOkResponse({ standardSchema: conversationMemberSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  updateRole(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('userId', new ZodValidationPipe(uuidSchema)) userId: string,
    @Body({
      schema: updateConversationMemberBodySchema,
      pipes: [new ZodValidationPipe(updateConversationMemberBodySchema)],
    })
    dto: UpdateConversationMemberBody,
  ): Promise<ConversationMember> {
    return this.members.updateRole(user.id, id, userId, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @Audit({ action: 'chat.member_remove', entity: 'conversation' })
  @ApiOperation({ summary: 'Исключение участника (право removeMembers + иерархия)' })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  async remove(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('userId', new ZodValidationPipe(uuidSchema)) userId: string,
  ): Promise<void> {
    await this.members.remove(user.id, id, userId);
  }
}
