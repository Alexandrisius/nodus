import { Injectable } from '@nestjs/common';
import { TASK_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { keyBetween } from '../lib/fractional-index.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';

/**
 * Размещения «Моего плана» (ADR-0008): у каждого держателя плана
 * (постановщик, ответственный, соисполнители) задача лежит в одной из его
 * личных колонок. Встроенное автоперемещение — СИНХРОННО в транзакции смены
 * состояния (не outbox-обработчиком: гонки с ручным переносом, трек 1).
 * Новая/переехавшая карточка встаёт в начало колонки.
 */
@Injectable()
export class Placements {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly eventBus: EventBus,
  ) {}

  /** Личные маршруты держателей — до бизнес-транзакции (ensurePersonal). */
  async prepare(userIds: string[]): Promise<void> {
    for (const id of new Set(userIds)) await this.workflows.ensurePersonal(id);
  }

  async topKey(tx: TransactionClient, userId: string, stageId: string): Promise<string> {
    const first = await tx.taskPersonalPlacement.findFirst({
      where: { userId, stageId },
      orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }],
      select: { sortOrder: true },
    });
    return keyBetween(null, first?.sortOrder ?? null);
  }

  /** Привести размещения к составу держателей и состоянию задачи. */
  async sync(
    tx: TransactionClient,
    task: { id: string; systemState: string },
    holderIds: string[],
    actorId: string | null,
  ): Promise<void> {
    await tx.taskPersonalPlacement.deleteMany({
      where: { taskId: task.id, userId: { notIn: holderIds } },
    });
    const existing = await tx.taskPersonalPlacement.findMany({
      where: { taskId: task.id },
      include: { stage: { select: { systemState: true } } },
    });
    const stages = await this.workflows.personalStagesOf(holderIds, tx);
    for (const userId of holderIds) {
      const current = existing.find((p) => p.userId === userId);
      if (current && current.stage.systemState === task.systemState) continue;
      const own = stages.filter((s) => s.workflow.ownerId === userId);
      const target = own.find((s) => s.systemState === task.systemState) ?? own[0];
      if (!target) continue; // маршрут не подготовлен — карточка появится при следующей синхронизации
      const sortOrder = await this.topKey(tx, userId, target.id);
      await tx.taskPersonalPlacement.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        update: { stageId: target.id, sortOrder },
        create: { taskId: task.id, userId, stageId: target.id, sortOrder },
      });
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
