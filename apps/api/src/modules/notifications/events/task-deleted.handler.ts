import { Injectable } from '@nestjs/common';
import { TASK_EVENTS, type DomainEvent, type DomainEventHandler } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { NotificationsService } from '../notifications.service.js';

/**
 * Подписчик `task.deleted` (#252): уведомления об удалённой задаче вели бы
 * в пустоту и висели вечно (класс бага #267 с удалёнными сообщениями) —
 * журнал чистится у всех получателей, клиенты получают notification.read.
 */
@Injectable()
export class TaskDeletedNotifyHandler implements DomainEventHandler<{ taskId?: string }> {
  static readonly eventType = TASK_EVENTS.DELETED;

  constructor(
    private readonly service: NotificationsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<{ taskId?: string }>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const { taskId } = event.payload;
    if (typeof taskId === 'string') await this.service.purgeBySource('task', taskId);
  }
}
