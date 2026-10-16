import { Injectable } from '@nestjs/common';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { keyBetween } from '../lib/fractional-index.js';

/**
 * Пункты чек-листа (`task_checklist_items`): порядок — fractional-index
 * `sort_order`; счётчики checklistDone/Total денормализуются в строку задачи
 * в той же tx (гейт checklist_complete и карточки досок).
 */
@Injectable()
export class ChecklistRepository {
  /** Стартовый чек-лист новой задачи (порядок — как в запросе). */
  async createInitial(tx: TransactionClient, taskId: string, texts: string[]): Promise<void> {
    let prev: string | null = null;
    const data = texts.map((text) => {
      prev = keyBetween(prev, null);
      return { taskId, text, sortOrder: prev };
    });
    if (data.length > 0) await tx.taskChecklistItem.createMany({ data });
  }

  /** Новый пункт — в конец списка. */
  async append(tx: TransactionClient, taskId: string, text: string) {
    const last = await tx.taskChecklistItem.findFirst({
      where: { taskId },
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    });
    return tx.taskChecklistItem.create({
      data: { taskId, text, sortOrder: keyBetween(last?.sortOrder ?? null, null) },
    });
  }

  findInTask(tx: TransactionClient, taskId: string, itemId: string) {
    return tx.taskChecklistItem.findFirst({ where: { id: itemId, taskId } });
  }

  update(
    tx: TransactionClient,
    itemId: string,
    patch: {
      text?: string;
      sortOrder?: string;
      done?: boolean;
      doneBy?: string | null;
      doneAt?: Date | null;
    },
  ) {
    return tx.taskChecklistItem.update({ where: { id: itemId }, data: patch });
  }

  /** Удалить пункт этой задачи; число удалённых строк (0 — чужой/нет). */
  async removeFromTask(tx: TransactionClient, taskId: string, itemId: string): Promise<number> {
    const { count } = await tx.taskChecklistItem.deleteMany({ where: { id: itemId, taskId } });
    return count;
  }

  /** Ключ для позиции index (без самого пункта). */
  async keyAt(tx: TransactionClient, taskId: string, itemId: string, index: number) {
    const near = await tx.taskChecklistItem.findMany({
      where: { taskId, id: { not: itemId } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      skip: Math.max(index - 1, 0),
      take: index === 0 ? 1 : 2,
      select: { sortOrder: true },
    });
    return index === 0
      ? keyBetween(null, near[0]?.sortOrder ?? null)
      : keyBetween(near[0]?.sortOrder ?? null, near[1]?.sortOrder ?? null);
  }

  /** Пересчёт checklistDone/Total задачи в той же tx. */
  async recount(tx: TransactionClient, taskId: string): Promise<{ total: number; done: number }> {
    const [total, done] = await Promise.all([
      tx.taskChecklistItem.count({ where: { taskId } }),
      tx.taskChecklistItem.count({ where: { taskId, done: true } }),
    ]);
    await tx.task.update({
      where: { id: taskId },
      data: { checklistTotal: total, checklistDone: done },
    });
    return { total, done };
  }
}
