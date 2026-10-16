import { Injectable } from '@nestjs/common';
import { TASK_EVENTS, type DomainEvent } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { TaskChatService } from './task-chat.service.js';

/**
 * Подписчики task.* (I3: chat узнаёт о задачах только событиями): создание
 * задачи, смена ответственного и участников — синхронизация состава беседы
 * задачи. Идемпотентны (повторная доставка outbox приводит к тому же
 * составу). Один класс на тип события (диспетчер регистрирует по static
 * eventType, дедуп — по имени класса).
 */
@Injectable()
class TaskChatSyncRunner {
  constructor(
    private readonly chat: TaskChatService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async run(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('chat'))) return;
    const taskId = event.payload.taskId;
    if (typeof taskId === 'string') await this.chat.sync(taskId, event.actorId);
  }
}

export { TaskChatSyncRunner };

const handlerFor = (eventType: string) => {
  @Injectable()
  class Handler {
    static readonly eventType = eventType;
    constructor(readonly runner: TaskChatSyncRunner) {}
    handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
      return this.runner.run(event);
    }
  }
  return Handler;
};

@Injectable()
export class TaskCreatedChatHandler extends handlerFor(TASK_EVENTS.CREATED) {}
@Injectable()
export class TaskAssignedChatHandler extends handlerFor(TASK_EVENTS.ASSIGNED) {}
@Injectable()
export class TaskParticipantsChatHandler extends handlerFor(TASK_EVENTS.PARTICIPANTS_CHANGED) {}
/** Удаление задачи — состав беседы распускается (sync видит roster=null). */
@Injectable()
export class TaskDeletedChatHandler extends handlerFor(TASK_EVENTS.DELETED) {}

/** Переименование задачи — строки «Чатов задач» у участников обновляются. */
@Injectable()
export class TaskUpdatedChatHandler {
  static readonly eventType = TASK_EVENTS.UPDATED;
  constructor(
    private readonly chat: TaskChatService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<{ taskId?: string; fields?: string[] }>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('chat'))) return;
    const { taskId, fields } = event.payload;
    if (typeof taskId === 'string' && fields?.includes('title')) {
      await this.chat.touch(taskId, event.actorId);
    }
  }
}
