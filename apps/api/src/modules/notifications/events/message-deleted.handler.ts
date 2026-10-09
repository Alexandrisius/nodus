import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { NotificationsService } from '../notifications.service.js';

interface MessageDeletedPayload {
  conversationId: string;
  messageId: string;
  obliterated: boolean;
}

/**
 * Подписчик `chat.message_deleted` (#267): удалённое до прочтения сообщение
 * не гасится прочтением (obliterated-строки нет во вьюпорте → watermark не
 * накроет source_seq) — уведомление висело бы вечно, ручных путей гашения у
 * чат-уведомлений нет. Строки журнала об удалённом сообщении чистятся у всех
 * получателей (текст исчез; надгробие/бесследно — без разницы), каждому
 * эмитится notification.read: бейдж и лента синхронизируются штатным
 * конвейером (I3: чат не знает про уведомления). Идемпотентно: повтор
 * события — 0 строк, 0 эмитов.
 */
@Injectable()
export class MessageDeletedHandler implements DomainEventHandler<MessageDeletedPayload> {
  static readonly eventType = 'chat.message_deleted';

  constructor(
    private readonly service: NotificationsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<MessageDeletedPayload>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const { conversationId, messageId } = event.payload;
    if (!conversationId || !messageId) return;
    await this.service.purgeByMessage(conversationId, messageId);
  }
}
