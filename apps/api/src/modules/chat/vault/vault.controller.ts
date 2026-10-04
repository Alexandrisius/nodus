import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  conversationVaultPageSchema,
  listConversationVaultQuerySchema,
  type ConversationVaultPage,
  type ListConversationVaultQuery,
} from '@nodus/contracts';

import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { VaultService } from './vault.service.js';

/**
 * Витрина беседы (#211): серверные списки вложений/ссылок правой панели
 * «О чате» — вложения ЗА пределами загруженного окна ленты видны. Чтение —
 * только участник (не-участник: 404, канон «не палить наличие»).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/conversations/:id')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('attachments')
  @ApiOperation({
    summary: 'Витрина беседы: страница media|document|link + счётчики всех типов (панель «О чате»)',
  })
  @ApiOkResponse({ standardSchema: conversationVaultPageSchema })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(z.uuid())) conversationId: string,
    @Query({
      schema: listConversationVaultQuerySchema,
      pipes: [new ZodValidationPipe(listConversationVaultQuerySchema)],
    })
    query: ListConversationVaultQuery,
  ): Promise<ConversationVaultPage> {
    return this.vault.list(user.id, conversationId, query);
  }
}
