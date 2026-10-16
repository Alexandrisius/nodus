import { Inject, Injectable } from '@nestjs/common';
import { CHAT_EVENTS, type DomainEvent } from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';

/**
 * `commentsCount` задачи = число живых сообщений её беседы (#252): chat
 * сообщает о сообщениях событиями, tasks пересчитывает счётчик через
 * read-порт (I3 — таблицы чата не читаются). Пересчёт, а не инкремент:
 * повторная доставка outbox даёт тот же результат.
 */
@Injectable()
export class TaskCommentsCounter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagService,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly chat: ChatMessageAccess,
  ) {}

  async recount(event: DomainEvent<{ conversationId?: string }>): Promise<void> {
    const { conversationId } = event.payload;
    if (typeof conversationId !== 'string') return;
    if (!(await this.featureFlags.isEnabled('tasks'))) return;
    const discussion = await this.chat.taskDiscussion(conversationId);
    if (!discussion) return;
    await this.prisma.task.updateMany({
      where: { id: discussion.taskId },
      data: { commentsCount: discussion.count },
    });
  }
}

@Injectable()
export class TaskCommentSentHandler {
  static readonly eventType = CHAT_EVENTS.MESSAGE_SENT;
  constructor(private readonly counter: TaskCommentsCounter) {}
  handle(event: DomainEvent<{ conversationId?: string }>): Promise<void> {
    return this.counter.recount(event);
  }
}

@Injectable()
export class TaskCommentDeletedHandler {
  static readonly eventType = CHAT_EVENTS.MESSAGE_DELETED;
  constructor(private readonly counter: TaskCommentsCounter) {}
  handle(event: DomainEvent<{ conversationId?: string }>): Promise<void> {
    return this.counter.recount(event);
  }
}
