import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  conversationVaultPageSchema,
  listConversationVaultQuerySchema,
  vaultCountsQuerySchema,
  vaultCountsSchema,
  type ConversationVaultPage,
  type ListConversationVaultQuery,
  type VaultCounts,
  type VaultCountsQuery,
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

  /** Счётчики категорий (панель-профиль Telegram-стиля) — O(1) из stats. */
  @Get('attachments/counts')
  @ApiOperation({
    summary:
      'Счётчики витрины по категориям image|video|audio|document|link (денормализованные, O(1))',
  })
  @ApiOkResponse({ standardSchema: vaultCountsSchema })
  @ApiErrors(400, 401, 404)
  counts(
    @GetUser() user: { id: string },
    @Param('id', new ZodValidationPipe(z.uuid())) conversationId: string,
    @Query({
      schema: vaultCountsQuerySchema,
      pipes: [new ZodValidationPipe(vaultCountsQuerySchema)],
    })
    query: VaultCountsQuery,
  ): Promise<VaultCounts> {
    return this.vault.counts(user.id, conversationId, query.threadRootId ?? null);
  }

  @Get('attachments')
  @ApiOperation({
    summary:
      'Витрина беседы: страница категории image|video|audio|document|link + счётчики всех категорий',
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
