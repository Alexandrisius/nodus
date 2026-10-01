import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { NotificationsService } from '../notifications.service.js';

interface MessageReadPayload {
  conversationId: string;
  userId: string;
  upToSeq: number;
}

/**
 * Подписчик `chat.message_read` (#100): вход в источник гасит журнал этого
 * пользователя по беседе (personal/action/фон до watermark; автопрочтение
 * яруса «личное») и останавливает срочные повторы (C2: прочитал → стоп;
 * строка висит до ознакомления). Идемпотентно: повторное гашение — no-op.
 */
@Injectable()
export class MessageReadHandler implements DomainEventHandler<MessageReadPayload> {
  static readonly eventType = 'chat.message_read';

  constructor(
    private readonly service: NotificationsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<MessageReadPayload>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const { conversationId, userId, upToSeq } = event.payload;
    if (!conversationId || !userId || typeof upToSeq !== 'number') return;
    await this.service.markReadBySource(userId, conversationId, upToSeq);
  }
}
