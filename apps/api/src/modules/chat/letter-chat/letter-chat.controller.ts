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
import { LetterChatService } from './letter-chat.service.js';

/** Чат письма (#55, Р10): find-or-create беседы письма для карточки. */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations')
export class LetterChatController {
  constructor(
    private readonly letterChat: LetterChatService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get('by-letter/:letterId')
  @ApiOperation({
    summary: 'Беседа письма (создаётся при первом открытии); не участник — 404',
  })
  @ApiOkResponse({ standardSchema: conversationListItemSchema })
  @ApiErrors(400, 401, 404)
  async byLetter(
    @GetUser() user: AuthUser,
    @Param('letterId', new ZodValidationPipe(z.uuid())) letterId: string,
  ): Promise<ConversationListItem> {
    const conversationId = await this.letterChat.openForUser(letterId, user);
    return this.conversations.item(conversationId, user.id);
  }
}
