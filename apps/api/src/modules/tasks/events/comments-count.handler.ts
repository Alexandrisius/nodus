import { Inject, Injectable } from '@nestjs/common';
import { CHAT_EVENTS, TASK_EVENTS, type DomainEvent } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';
import { audienceIds } from '../access/task-access.js';

/**
 * `commentsCount` задачи = число живых сообщений её беседы (#252): chat
 * сообщает о сообщениях событиями, tasks пересчитывает счётчик через
 * read-порт (I3 — таблицы чата не читаются). Пересчёт, а не инкремент:
 * повторная доставка outbox даёт тот же результат. Точное значение уходит
 * участникам событием `task.comments_counted` — карточки досок обновляют
 * счётчик без рефеча (мгновенный +1 клиент делает сам по chat.message_sent).
 */
@Injectable()
export class TaskCommentsCounter {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly featureFlags: FeatureFlagService,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly chat: ChatMessageAccess,
  ) {}

  async recount(event: DomainEvent<{ conversationId?: string }>): Promise<void> {
    const { conversationId } = event.payload;
    if (typeof conversationId !== 'string') return;
    if (!(await this.featureFlags.isEnabled('tasks'))) return;
    const discussion = await this.chat.taskDiscussion(conversationId);
    if (!discussion) return;
    await this.txRunner.run(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: discussion.taskId, deletedAt: null },
        select: { id: true, number: true, creatorId: true, assigneeId: true, participants: true },
      });
      if (!task) return;
      await tx.task.update({
        where: { id: task.id },
        data: { commentsCount: discussion.count },
      });
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.COMMENTS_COUNTED,
        {
          taskId: task.id,
          number: task.number,
          audience: audienceIds(task),
          commentsCount: discussion.count,
        },
        { actorId: event.actorId, aggregateType: 'task', aggregateId: task.id },
      );
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
