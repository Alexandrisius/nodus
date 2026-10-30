import { Injectable } from '@nestjs/common';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { keyBetween } from '../../../core/lib/fractional-index.js';

/**
 * Размещения «Моего плана» (`task_personal_placements`, ADR-0008): карточка
 * задачи в личной колонке держателя плана; порядок — fractional-index
 * `sort_order` (COLLATE "C"), keyset `(sort_order, task_id)`.
 */
@Injectable()
export class PlacementsRepository {
  /** Ключ начала колонки пользователя (новая/переехавшая карточка — первой). */
  async topKey(tx: TransactionClient, userId: string, stageId: string): Promise<string> {
    const first = await tx.taskPersonalPlacement.findFirst({
      where: { userId, stageId },
      orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }],
      select: { sortOrder: true },
    });
    return keyBetween(null, first?.sortOrder ?? null);
  }

  /** Ключ для позиции index в личной колонке (без самой задачи). */
  async keyAt(
    tx: TransactionClient,
    userId: string,
    stageId: string,
    index: number,
    exceptTaskId: string,
  ): Promise<string> {
    const near = await tx.taskPersonalPlacement.findMany({
      where: { userId, stageId, taskId: { not: exceptTaskId } },
      orderBy: [{ sortOrder: 'asc' }, { taskId: 'asc' }],
      skip: Math.max(index - 1, 0),
      take: index === 0 ? 1 : 2,
      select: { sortOrder: true },
    });
    return index === 0
      ? keyBetween(null, near[0]?.sortOrder ?? null)
      : keyBetween(near[0]?.sortOrder ?? null, near[1]?.sortOrder ?? null);
  }

  /** Размещения задачи с состоянием их колонок. */
  listForTask(tx: TransactionClient, taskId: string) {
    return tx.taskPersonalPlacement.findMany({
      where: { taskId },
      include: { stage: { select: { systemState: true } } },
    });
  }

  findOne(tx: TransactionClient, taskId: string, userId: string) {
    return tx.taskPersonalPlacement.findUnique({ where: { taskId_userId: { taskId, userId } } });
  }

  /** Снять карточку у всех, кто больше не держит план задачи. */
  async removeExcept(tx: TransactionClient, taskId: string, holderIds: string[]): Promise<void> {
    await tx.taskPersonalPlacement.deleteMany({
      where: { taskId, userId: { notIn: holderIds } },
    });
  }

  async removeAllForTask(tx: TransactionClient, taskId: string): Promise<void> {
    await tx.taskPersonalPlacement.deleteMany({ where: { taskId } });
  }

  async place(
    tx: TransactionClient,
    p: { taskId: string; userId: string; stageId: string; sortOrder: string },
  ): Promise<void> {
    await tx.taskPersonalPlacement.upsert({
      where: { taskId_userId: { taskId: p.taskId, userId: p.userId } },
      update: { stageId: p.stageId, sortOrder: p.sortOrder },
      create: p,
    });
  }

  /** Перенос существующей карточки (нет размещения — P2025 → 404 фильтром). */
  async move(
    tx: TransactionClient,
    p: { taskId: string; userId: string; stageId: string; sortOrder: string },
  ): Promise<void> {
    await tx.taskPersonalPlacement.update({
      where: { taskId_userId: { taskId: p.taskId, userId: p.userId } },
      data: { stageId: p.stageId, sortOrder: p.sortOrder },
    });
  }

  /** Все карточки колонки — в другую колонку (архивация/смена состояния). */
  async moveColumn(tx: TransactionClient, fromStageId: string, toStageId: string): Promise<void> {
    await tx.taskPersonalPlacement.updateMany({
      where: { stageId: fromStageId },
      data: { stageId: toStageId },
    });
  }
}
