import { Injectable } from '@nestjs/common';
import { TASK_EVENTS, type DomainEvent } from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { ProjectMembersService } from '../project-members.service.js';

/**
 * Проекция участия «из задач» (Р2, Т2): события task.*, меняющие людей или
 * проект задачи, пересчитывают строки source='task' открытых проектов.
 * Идемпотентны (replaceTaskSource сходится к текущему составу); секретные
 * проекты пропускаются — их состав задачи не расширяют (verdikt 29.10).
 */
@Injectable()
class TaskParticipantsProjectionRunner {
  constructor(
    private readonly members: ProjectMembersService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async run(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('projects'))) return;
    const projectIds = new Set<string>();
    for (const key of ['projectId', 'previousProjectId'] as const) {
      const value = event.payload[key];
      if (typeof value === 'string' && value.length > 0) projectIds.add(value);
    }
    for (const projectId of projectIds) {
      await this.members.recomputeTaskSource(projectId);
    }
  }
}

export { TaskParticipantsProjectionRunner };

const handlerFor = (eventType: string) => {
  @Injectable()
  class Handler {
    static readonly eventType = eventType;
    constructor(readonly runner: TaskParticipantsProjectionRunner) {}
    handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
      return this.runner.run(event);
    }
  }
  return Handler;
};

@Injectable()
export class TaskCreatedProjectHandler extends handlerFor(TASK_EVENTS.CREATED) {}
@Injectable()
export class TaskUpdatedProjectHandler extends handlerFor(TASK_EVENTS.UPDATED) {}
@Injectable()
export class TaskAssignedProjectHandler extends handlerFor(TASK_EVENTS.ASSIGNED) {}
@Injectable()
export class TaskParticipantsProjectHandler extends handlerFor(TASK_EVENTS.PARTICIPANTS_CHANGED) {}
/** Удалённая задача больше не держит участников (projectId в payload, Р4). */
@Injectable()
export class TaskDeletedProjectHandler extends handlerFor(TASK_EVENTS.DELETED) {}
