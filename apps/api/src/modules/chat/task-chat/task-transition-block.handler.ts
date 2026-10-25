import { Injectable } from '@nestjs/common';
import { TASK_EVENTS, type DomainEvent, type TaskStageChangedPayload } from '@nodus/contracts';

import { TaskTransitionBlockService } from './task-transition-block.service.js';

/**
 * Слушатель `task.stage_changed` (#380): блок перехода в чате задачи.
 * Идемпотентен по id события; регистрируется диспетчером по static eventType
 * (как остальные обработчики task.* — I3: chat узнаёт о задачах событиями).
 */
@Injectable()
export class TaskTransitionBlockHandler {
  static readonly eventType = TASK_EVENTS.STAGE_CHANGED;

  constructor(private readonly blocks: TaskTransitionBlockService) {}

  handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    return this.blocks.post(event as DomainEvent<TaskStageChangedPayload>);
  }
}
