import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  conversationListItemSchema,
  type AuthUser,
  type ConversationListItem,
} from '@nodus/contracts';

import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { ProjectChatService } from './project-chat.service.js';

/** Канал проекта (#52, Р8): find-or-create беседы канала для карточки. */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations')
export class ProjectChatController {
  constructor(
    private readonly projectChat: ProjectChatService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get('by-project/:projectId')
  @ApiOperation({
    summary: 'Канал проекта (создаётся при первом открытии); не участник проекта — 404',
  })
  @ApiOkResponse({ standardSchema: conversationListItemSchema })
  @ApiErrors(400, 401, 404)
  async byProject(
    @GetUser() user: AuthUser,
    @Param('projectId', new ZodValidationPipe(z.uuid())) projectId: string,
  ): Promise<ConversationListItem> {
    const conversationId = await this.projectChat.openForUser(projectId, user);
    return this.conversations.item(conversationId, user.id);
  }
}
