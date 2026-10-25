import { Injectable } from '@nestjs/common';
import { statesOfPhase, type CustomFieldValues } from '@nodus/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { TaskGateFacts } from './task-write.types.js';

/**
 * Факты строки задачи для движка и кастомных атрибутов (#380, #431):
 * гейты маршрута, текущие значения атрибутов под замком строки и уборка
 * значений удалённого определения. Вынесено из `TasksRepository`, чтобы
 * основной репозиторий оставался в пределах лимита строк: здесь только
 * чтения-снимки и одна служебная запись.
 */
@Injectable()
export class TaskFactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async gateFacts(taskId: string, tx: TransactionClient): Promise<TaskGateFacts> {
    const children = (phase: 'open' | 'review') =>
      tx.task.count({
        where: { parentId: taskId, deletedAt: null, systemState: { in: statesOfPhase(phase) } },
      });
    const [task, openSubtasks, reviewSubtasks, result] = await Promise.all([
      tx.task.findUniqueOrThrow({ where: { id: taskId } }),
      children('open'),
      children('review'),
      tx.taskResult.findFirst({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
        select: { text: true, messageIds: true },
      }),
    ]);
    return {
      stageId: task.stageId,
      acceptRequired: task.acceptRequired,
      creatorIsAssignee: task.creatorId === task.assigneeId,
      openSubtasks,
      reviewSubtasks,
      checklistDone: task.checklistDone,
      checklistTotal: task.checklistTotal,
      spentMinutes: task.spentMinutes,
      description: task.description,
      deadline: task.deadline,
      assigneeId: task.assigneeId,
      plannedMinutes: task.plannedMinutes,
      hasResult: Boolean(result?.text.trim()),
      customFields: (task.customFields ?? {}) as Record<string, unknown>,
      // Файлы итога — вложения сообщений ревизии (#380); считает порт чата
      // (задача чужих таблиц не читает — I3/I6).
      resultMessageIds: Array.isArray(result?.messageIds) ? (result.messageIds as string[]) : [],
    };
  }

  /** Текущие значения кастомных атрибутов — под замком строки (#431). */
  async customFieldsOf(tx: TransactionClient, id: string): Promise<CustomFieldValues> {
    const row = await tx.task.findUniqueOrThrow({
      where: { id },
      select: { customFields: true },
    });
    return (row.customFields ?? {}) as CustomFieldValues;
  }

  /**
   * Уборка значения удалённого атрибута (#431): ключ убирается у всех задач
   * пачками по `BATCH` строк — одна транзакция на всю таблицу держала бы
   * блокировки на объёме 10⁵ задач (замечание security-гейта). Пачка ищет
   * строки подзапросом по GIN-индексу `tasks_custom_fields_gin`.
   */
  async removeCustomFieldValues(fieldId: string, batch = 500): Promise<number> {
    let removed = 0;
    for (;;) {
      const affected = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE tasks SET custom_fields = custom_fields - ${fieldId}
        WHERE id IN (
          SELECT id FROM tasks WHERE custom_fields ? ${fieldId} LIMIT ${batch}::int
        )
      `);
      removed += affected;
      if (affected === 0) return removed;
    }
  }
}
