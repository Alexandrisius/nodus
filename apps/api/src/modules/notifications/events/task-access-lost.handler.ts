import { Inject, Injectable } from '@nestjs/common';
import { TASK_EVENTS, type DomainEvent, type DomainEventHandler } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { TASK_CHAT_READER, type TaskChatReader } from '../../tasks/ports/task-chat-reader.port.js';
import { NotificationsService } from '../notifications.service.js';

interface AccessLostPayload {
  taskId?: string;
  removed?: string[];
  previousAssigneeId?: string | null;
}

/**
 * Потеря участия в задаче (#311, фидбек владельца «уведомления-ссылки в
 * никуда»): снятому соисполнителю/наблюдателю и прежнему ответственному
 * задача больше не «своя» — её уведомления у них удаляются (класс бага
 * #252/#267). Кто остался в составе (сменил роль, стал постановщиком) —
 * не трогаем: состав читается через read-порт задач (ADR-0012), не таблицы.
 */
@Injectable()
export class TaskAccessLostWriter {
  constructor(
    private readonly service: NotificationsService,
    private readonly featureFlags: FeatureFlagService,
    @Inject(TASK_CHAT_READER) private readonly tasks: TaskChatReader,
  ) {}

  async handle(event: DomainEvent<AccessLostPayload>): Promise<void> {
    const { taskId, removed, previousAssigneeId } = event.payload;
    if (typeof taskId !== 'string') return;
    const candidates = [...(removed ?? []), ...(previousAssigneeId ? [previousAssigneeId] : [])];
    if (candidates.length === 0) return;
    if (!(await this.featureFlags.isEnabled('notifications'))) return;
    const roster = await this.tasks.roster(taskId);
    const stay = new Set([
      ...(roster?.members.map((m) => m.userId) ?? []),
      ...(roster ? [roster.creatorId] : []),
    ]);
    const lost = [...new Set(candidates)].filter((id) => !stay.has(id));
    await this.service.purgeBySourceForUsers('task', taskId, lost);
  }
}

@Injectable()
export class TaskParticipantsAccessLostHandler implements DomainEventHandler<AccessLostPayload> {
  static readonly eventType = TASK_EVENTS.PARTICIPANTS_CHANGED;
  constructor(private readonly writer: TaskAccessLostWriter) {}
  handle(event: DomainEvent<AccessLostPayload>): Promise<void> {
    return this.writer.handle(event);
  }
}

@Injectable()
export class TaskAssigneeAccessLostHandler implements DomainEventHandler<AccessLostPayload> {
  static readonly eventType = TASK_EVENTS.ASSIGNED;
  constructor(private readonly writer: TaskAccessLostWriter) {}
  handle(event: DomainEvent<AccessLostPayload>): Promise<void> {
    return this.writer.handle(event);
  }
}
