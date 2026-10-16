import { Injectable } from '@nestjs/common';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';

export type ParticipantRole = 'coexecutor' | 'observer';

/**
 * Соисполнители и наблюдатели (`task_participants`). Ответственный и
 * постановщик — колонки задачи, не строки этой таблицы. Звук: наблюдатель
 * всегда muted (Битрикс24), соисполнитель — со звуком.
 */
@Injectable()
export class ParticipantsRepository {
  /** Добавить участника или сменить роль; muted следует роли (смена
   *  наблюдатель → соисполнитель включает уведомления, обратная — гасит). */
  async assignRole(
    tx: TransactionClient,
    taskId: string,
    userId: string,
    role: ParticipantRole,
  ): Promise<void> {
    const muted = role === 'observer';
    await tx.taskParticipant.upsert({
      where: { taskId_userId: { taskId, userId } },
      update: { role, muted },
      create: { taskId, userId, role, muted },
    });
  }

  /** Снять участника (onlyRole — только в этой роли); число снятых строк. */
  async remove(
    tx: TransactionClient,
    taskId: string,
    userId: string,
    onlyRole?: ParticipantRole,
  ): Promise<number> {
    const { count } = await tx.taskParticipant.deleteMany({
      where: { taskId, userId, ...(onlyRole ? { role: onlyRole } : {}) },
    });
    return count;
  }
}
