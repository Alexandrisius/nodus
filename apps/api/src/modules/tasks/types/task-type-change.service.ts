import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type ChangeTaskTypeBody,
  type TaskListItem,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, planHolderIds, taskAccess } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { TasksService } from '../tasks/tasks.service.js';
import { StageMover } from '../workflow/stage-mover.js';
import { TaskTypesRepository } from './task-types.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';

/**
 * Смена типа задачи (#378): право правки (постановщик / исполнитель /
 * task.manage_any — как у PATCH). Если текущего статуса нет в новом маршруте
 * — обязателен `stageId`; переезд стадии — общий помощник StageMover
 * (cause=type_change), событие `task.type_changed` участникам.
 */
@Injectable()
export class TaskTypeChangeService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly query: TasksQueryService,
    private readonly tasks: TasksRepository,
    private readonly workflows: WorkflowRepository,
    private readonly typeRepo: TaskTypesRepository,
    private readonly placements: Placements,
    private readonly mover: StageMover,
    private readonly eventBus: EventBus,
    private readonly taskService: TasksService,
  ) {}

  async change(user: AuthUser, taskId: string, body: ChangeTaskTypeBody): Promise<TaskListItem> {
    const row = await this.query.visibleRow(user, taskId);
    const access = taskAccess(actorRoles(row, user.id), user.permissions);
    if (!access.canEdit) throw DomainException.forbidden('Task edit not allowed');
    const nextType = await this.typeRepo.findLiveById(body.typeId);
    if (!nextType) throw DomainException.notFound('Task type not found');
    if (nextType.id === row.type.id) return this.taskService.listItem(user.id, taskId);
    const resolved = await this.workflows.resolveTypeWorkflow(nextType.id, {
      // Скрытый тип недоступен смене и на сервере (security #378).
      requireCreatable: true,
    });
    const workflow = await this.workflows.load(resolved.workflowId);
    const sameStage = workflow.stages.find((s) => s.id === row.stage.id && !s.archivedAt);
    const stageId = sameStage?.id ?? body.stageId;
    if (!stageId) {
      throw new DomainException(
        ErrorCode.WORKFLOW_MIGRATION_REQUIRED,
        'Current stage is not in the new workflow — stageId is required',
        { stages: [{ stageId: row.stage.id, count: 1 }] },
      );
    }
    const target = workflow.stages.find((s) => s.id === stageId && !s.archivedAt);
    if (!target) throw DomainException.notFound('Stage not found');

    await this.placements.prepare(planHolderIds(row));

    await this.txRunner.run(async (tx) => {
      await this.tasks.lock(tx, taskId);
      const task = await this.tasks.findWithParticipants(taskId, tx);
      // Стадию перечитываем в транзакции: параллельная публикация могла
      // архивировать её после проверки выше (security #378, целостность).
      const target = await this.workflows.findStageById(stageId, tx);
      if (!target || target.archivedAt) {
        throw DomainException.notFound('Stage not found');
      }
      await this.tasks.setType(tx, taskId, {
        typeId: nextType.id,
        workflowId: resolved.workflowId,
      });
      // Статус есть и в новом маршруте — стадия не меняется (без шума событий).
      if (target.id !== task.stageId) {
        await this.mover.apply(tx, task, target, user.id, {
          transitionId: null,
          cause: 'type_change',
        });
      }
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.TYPE_CHANGED,
        {
          taskId: task.id,
          number: task.number,
          audience: audienceIds(task),
          title: task.title,
          typeId: nextType.id,
          typeName: nextType.name,
          fromTypeId: row.type.id,
          workflowId: resolved.workflowId,
          stageId: target.id,
          stageName: target.name,
        },
        { actorId: user.id, aggregateType: 'task', aggregateId: task.id },
      );
    });
    return this.taskService.listItem(user.id, taskId);
  }
}
