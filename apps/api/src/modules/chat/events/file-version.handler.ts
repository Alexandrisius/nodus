import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CHAT_EVENTS,
  FILE_EVENTS,
  type ChatAttachmentUpdatedPayload,
  type DomainEvent,
  type DomainEventHandler,
  type FileVersionCreatedPayload,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { PrismaService } from '../../../core/database/prisma.service.js';

/**
 * Подписка chat на `file.version_created` (мост files → клиенты, #182):
 * событие files не маршрутизируется gateway'ем (нет conversationId), а
 * участники беседы должны увидеть новую версию вложения без F5. Здесь
 * переносим его в `chat.attachment_updated` по каждой беседе с вложением —
 * маршрутизация в conv-комнату из коробки (I3: связь модулей событиями).
 * Идемпотентность: повторная доставка не дублируется диспетчером
 * (event_deliveries); дубли эмитов безвредны (клиент только рефечит).
 */
@Injectable()
export class FileVersionHandler implements DomainEventHandler<FileVersionCreatedPayload> {
  static readonly eventType = FILE_EVENTS.VERSION_CREATED;

  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileVersionHandler.name);
  }

  async handle(event: DomainEvent<FileVersionCreatedPayload>): Promise<void> {
    const { fileId, version, size } = event.payload;
    if (!fileId || typeof version !== 'number') return;

    // Только отправленные вложения (messageId ≠ null): «трей» композера
    // аудитории не имеет; distinct по беседам — файл может лежать в нескольких.
    const rows = await this.prisma.messageAttachment.findMany({
      where: { fileId, messageId: { not: null } },
      select: { message: { select: { conversationId: true } } },
    });
    const conversationIds = [
      ...new Set(rows.map((row) => row.message?.conversationId).filter((id): id is string => !!id)),
    ];
    if (conversationIds.length === 0) return;

    await this.txRunner.run(async (tx) => {
      for (const conversationId of conversationIds) {
        const payload: ChatAttachmentUpdatedPayload = {
          conversationId,
          fileId,
          version,
          size,
        };
        await this.eventBus.emit(tx, CHAT_EVENTS.ATTACHMENT_UPDATED, payload, {
          aggregateType: 'conversation',
          aggregateId: conversationId,
        });
      }
    });
    this.logger.info(
      { fileId, version, conversations: conversationIds.length },
      'Attachment version fanout',
    );
  }
}
