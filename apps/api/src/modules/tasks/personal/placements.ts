import { Injectable } from '@nestjs/common';
import { TASK_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { PlacementsRepository } from './placements.repository.js';

/**
 * Размещения «Моего плана» (ADR-0008): у каждого держателя плана
 * (постановщик, ответственный, соисполнители) задача лежит в одной из его
 * личных колонок. Встроенное автоперемещение — СИНХРОННО в транзакции смены
 * состояния (не outbox-обработчиком: гонки с ручным переносом, трек 1).
 * Новая/переехавшая карточка встаёт в начало колонки. Задача структурного
 * типа (узел дерева проекта, ADR-0020) в «Мой план» не попадает: держателей
 * у неё нет, прежние размещения снимаются.
 */
@Injectable()
export class Placements {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly tasks: TasksRepository,
    private readonly repo: PlacementsRepository,
    private readonly eventBus: EventBus,
  ) {}

  /** Личные маршруты держателей — до бизнес-транзакции (ensurePersonal). */
  async prepare(userIds: string[]): Promise<void> {
    await Promise.all([...new Set(userIds)].map((id) => this.workflows.ensurePersonal(id)));
  }

  topKey(tx: TransactionClient, userId: string, stageId: string): Promise<string> {
    return this.repo.topKey(tx, userId, stageId);
  }

  /** Привести размещения к составу держателей и состоянию задачи. */
  async sync(
    tx: TransactionClient,
    task: { id: string; systemState: string },
    holderIds: string[],
    actorId: string | null,
  ): Promise<void> {
    const holders = (await this.tasks.isStructural(tx, task.id)) ? [] : holderIds;
    await this.repo.removeExcept(tx, task.id, holders);
    if (holders.length === 0) return;
    const existing = await this.repo.listForTask(tx, task.id);
    const stages = await this.workflows.personalStagesOf(holders, tx);
    for (const userId of holders) {
      const current = existing.find((p) => p.userId === userId);
      if (current && current.stage.systemState === task.systemState) continue;
      const own = stages.filter((s) => s.workflow.ownerId === userId);
      const target = own.find((s) => s.systemState === task.systemState) ?? own[0];
      if (!target) continue; // маршрут не подготовлен — карточка появится при следующей синхронизации
      const sortOrder = await this.repo.topKey(tx, userId, target.id);
      await this.repo.place(tx, { taskId: task.id, userId, stageId: target.id, sortOrder });
      if (current) {
        await this.eventBus.emit(
          tx,
          TASK_EVENTS.PERSONAL_STAGE_CHANGED,
          { taskId: task.id, userId, stageId: target.id, audience: [userId] },
          { actorId, aggregateType: 'task', aggregateId: task.id },
        );
      }
    }
  }
}
