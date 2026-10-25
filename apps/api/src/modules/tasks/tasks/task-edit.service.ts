import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  TASK_EVENTS,
  type AuthUser,
  type TaskListItem,
  type TaskUpdateBody,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  WORKFLOW_ENGINE,
  type WorkflowEnginePort,
} from '../../workflows/ports/workflow-engine.port.js';
import { actorRoles, planHolderIds, taskAccess } from '../access/task-access.js';
import { PersonalBoardsRepository } from '../personal/personal-boards.repository.js';
import { Placements } from '../personal/placements.js';
import { PlacementsRepository } from '../personal/placements.repository.js';
import type { TaskListRow } from './task-row.js';
import { TaskFieldsWriter } from './task-fields.writer.js';
import { TasksQueryService } from './tasks-query.service.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

const FIELD_KEYS = [
  'title',
  'description',
  'priority',
  'deadline',
  'plannedMinutes',
  'assigneeId',
  'parentId',
] as const;

/**
 * PATCH задачи: перенос по обеим осям (глобальная — переход маршрута,
 * личная — колонка «Моего плана», другая колонка состояния = переход) и
 * правка полей. Правка — постановщик/ответственный/task.manage_any.
 */
@Injectable()
export class TaskEditService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly repo: TasksRepository,
    private readonly query: TasksQueryService,
    private readonly tasks: TasksService,
    private readonly placements: Placements,
    private readonly placementsRepo: PlacementsRepository,
    private readonly boards: PersonalBoardsRepository,
    private readonly writer: TaskFieldsWriter,
    @Inject(WORKFLOW_ENGINE) private readonly engine: WorkflowEnginePort,
  ) {}

  async update(user: AuthUser, id: string, body: TaskUpdateBody): Promise<TaskListItem> {
    // #431 UI-пакет: заглушка до бэкенд-пакета — определений полей ещё нет,
    // любое значение невалидно (верно и после бэкенда, пока полей нет).
    if (body.customFields && Object.keys(body.customFields).length > 0) {
      throw new DomainException(ErrorCode.CUSTOM_FIELD_VALUE_INVALID, 'Unknown custom field', {
        issues: Object.keys(body.customFields).map((fieldId) => ({
          fieldId,
          reason: 'unknown',
          message: 'Unknown custom field',
        })),
      });
    }
    const row = await this.query.visibleRow(user, id);
    const access = taskAccess(actorRoles(row, user.id), user.permissions);
    const fields = FIELD_KEYS.filter((k) => body[k] !== undefined);
    if (fields.length > 0 && !access.canEdit)
      throw DomainException.forbidden('Task edit not allowed');
    if (body.assigneeId) await this.tasks.assertActiveUsers([body.assigneeId]);
    if (body.parentId === id) {
      throw new DomainException(ErrorCode.TASK_PARENT_CYCLE, 'Task cannot be its own parent');
    }
    if (body.parentId !== undefined && body.parentId !== row.parentId) {
      // Перепривязка трогает ОБА конца: новый родитель получает подзадачу,
      // прежний — теряет (иначе отвязка обходила бы его гейт «нет открытых
      // подзадач»). Права правки нужны на обоих (security-гейт #37, р.2).
      if (body.parentId) await this.tasks.assertCanEditParent(user, body.parentId);
      if (row.parentId) await this.tasks.assertCanEditParent(user, row.parentId);
    }
    const holdersAfter = planHolderIds({ ...row, assigneeId: body.assigneeId ?? row.assigneeId });
    await this.placements.prepare(holdersAfter);

    await this.txRunner.run(async (tx) => {
      if (fields.length > 0) await this.applyFields(tx, user, row, body, fields);
      if (body.stageId)
        await this.moveGlobal(tx, user, row, body.stageId, body.index, access.canEdit);
      if (body.personalStageId)
        await this.movePersonal(tx, user, row, body.personalStageId, body.index);
    });
    return this.tasks.listItem(user.id, id);
  }

  private async applyFields(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    body: TaskUpdateBody,
    fields: readonly string[],
  ): Promise<void> {
    // Доменная логика правки полей — общий писатель (#380): окно перехода
    // правит поля тем же кодом (локи, перепривязка, события).
    await this.writer.apply(
      tx,
      user.id,
      row,
      {
        title: body.title,
        description: body.description,
        priority: body.priority,
        plannedMinutes: body.plannedMinutes,
        parentId: body.parentId,
        deadline: body.deadline,
        assigneeId: body.assigneeId,
      },
      fields,
    );
  }

  private async moveGlobal(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    stageId: string,
    index: number | undefined,
    canEdit: boolean,
  ): Promise<void> {
    const currentStageId = await this.repo.stageIdOf(tx, row.id);
    if (currentStageId !== stageId) {
      await this.engine.execute(tx, row.id, 'task', user, { stageId });
    } else if (!canEdit) {
      throw DomainException.forbidden('Reorder not allowed');
    }
    if (index !== undefined) {
      const stageOrder = await this.repo.stageKeyAt(tx, stageId, index, row.id);
      await this.repo.setStageOrder(tx, row.id, stageOrder);
    }
  }

  /** Колонка «Моего плана»: только держатель плана; колонка другого
   *  состояния — переход маршрута в стадию этого состояния. */
  private async movePersonal(
    tx: TransactionClient,
    user: AuthUser,
    row: TaskListRow,
    stageId: string,
    index: number | undefined,
  ): Promise<void> {
    const column = await this.boards.findColumn(user.id, stageId, tx);
    if (!column) throw DomainException.notFound('Stage not found');
    const placement = await this.placementsRepo.findOne(tx, row.id, user.id);
    if (!placement) throw DomainException.notFound('Task is not in your plan');
    const systemState = await this.repo.systemStateOf(tx, row.id);
    if (systemState !== column.systemState) {
      await this.engine.execute(tx, row.id, 'task', user, { systemState: column.systemState });
    }
    const sortOrder = await this.placementsRepo.keyAt(tx, user.id, stageId, index ?? 0, row.id);
    await this.placementsRepo.move(tx, { taskId: row.id, userId: user.id, stageId, sortOrder });
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.PERSONAL_STAGE_CHANGED,
      { taskId: row.id, userId: user.id, stageId, audience: [user.id] },
      { actorId: user.id, aggregateType: 'task', aggregateId: row.id },
    );
  }
}
