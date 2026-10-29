import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthUser,
  ExecuteTransitionBody,
  ExecuteTransitionResult,
  WorkflowTransition,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import {
  WORKFLOW_ENGINE,
  type WorkflowEnginePort,
} from '../../workflows/ports/workflow-engine.port.js';
import { actorRoles, planHolderIds, taskAccess } from '../access/task-access.js';
import { Placements } from '../personal/placements.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { TasksService } from '../tasks/tasks.service.js';

/**
 * Сценарии API «кнопки маршрута» задачи (ADR-0020; движок — модуль
 * «Процессы», ADR-0024): видимость задачи, подготовка личных маршрутов,
 * транзакция, ответ. Сам порядок «замок → субъект → условия → гейты →
 * обход → смена стадии» ведёт WORKFLOW_ENGINE в этой транзакции; здесь —
 * только задачная обвязка.
 */
@Injectable()
export class TaskTransitionsService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly query: TasksQueryService,
    private readonly placements: Placements,
    private readonly taskService: TasksService,
    @Inject(WORKFLOW_ENGINE) private readonly engine: WorkflowEnginePort,
  ) {}

  /** GET /tasks/:id/transitions — кнопки маршрута видимой задачи. */
  async listFor(user: AuthUser, taskId: string): Promise<WorkflowTransition[]> {
    await this.query.visibleRow(user, taskId);
    return this.txRunner.run((tx) => this.engine.available(tx, taskId, 'task', user));
  }

  /** POST /tasks/:id/transitions/:transitionId — выполнить кнопку. Личные
   *  маршруты держателей готовятся ДО транзакции (ensurePersonal). В ответе
   *  — новые кнопки нажавшего: панель процесса обновляется одним ходом. */
  async executeFor(
    user: AuthUser,
    taskId: string,
    transitionId: string,
    body: ExecuteTransitionBody,
  ): Promise<ExecuteTransitionResult> {
    const row = await this.query.visibleRow(user, taskId);
    // Новый ответственный из окна — только если актор вправе править поля
    // (как PATCH: сначала право, потом проверка пользователя — иначе ответ
    // «нет такого пользователя» стал бы оракулом для наблюдателя).
    const access = taskAccess(actorRoles(row, user.id), user.permissions);
    const assigneeId = access.canEdit ? body.form?.fields?.assigneeId : undefined;
    if (assigneeId) await this.taskService.assertActiveUsers([assigneeId]);
    // Личные маршруты держателей готовятся ДО транзакции (ensurePersonal);
    // новый ответственный из окна — тоже держатель плана (как в PATCH).
    await this.placements.prepare(
      planHolderIds({ ...row, assigneeId: assigneeId ?? row.assigneeId }),
    );
    const transitions = await this.txRunner.run(async (tx) => {
      await this.engine.execute(tx, taskId, 'task', user, { transitionId }, body);
      return this.engine.available(tx, taskId, 'task', user);
    });
    return { task: await this.taskService.listItem(user, taskId), transitions };
  }
}
