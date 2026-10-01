import { Injectable } from '@nestjs/common';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { NotificationsService } from '../notifications.service.js';

interface ReactionPayload {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}

/**
 * Подписчик `chat.reaction_added` (#100): реакция получателя на сообщение
 * останавливает его срочные повторы (C3: равноценно прочтению, Mattermost-
 * канон). Идемпотентно: повторный стоп — no-op.
 */
@Injectable()
export class ReactionAddedHandler implements DomainEventHandler<ReactionPayload> {
  static readonly eventType = 'chat.reaction_added';

  constructor(
    private readonly service: NotificationsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<ReactionPayload>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const { messageId, userId } = event.payload;
    if (!messageId || !userId) return;
    await this.service.stopRepeatsByReaction(userId, messageId);
  }
}
