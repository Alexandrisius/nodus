import { Injectable } from '@nestjs/common';
import { TASK_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { audienceIds } from '../access/task-access.js';
import type { ChatMessageSnapshot } from '../../chat/message-access.port.js';
import { ResultsRepository } from './results.repository.js';

/** Задача для записи итога: аудитория события и номер (роли не нужны). */
export interface ResultTask {
  id: string;
  number: number;
  creatorId: string;
  assigneeId: string;
  participants: readonly { userId: string; role: string }[];
}

/**
 * Создание ревизии итога задачи (#380): единая точка для «Добавить
 * результат» и окна перехода — запись ревизии + `task.result_set` в
 * транзакции вызывающего. Вложения сообщений считаются по снимкам порта
 * чата (Σ attachmentCount), поэтому вызывающий обязан передать снимки всех
 * messageIds (проверка принадлежности беседе задачи — там же).
 */
@Injectable()
export class ResultRevisions {
  constructor(
    private readonly repo: ResultsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async create(
    tx: TransactionClient,
    actorId: string,
    task: ResultTask,
    data: { text: string; messageIds: string[] },
    snaps: readonly ChatMessageSnapshot[],
  ): Promise<{ result: Awaited<ReturnType<ResultsRepository['create']>>; fileCount: number }> {
    const result = await this.repo.create(tx, {
      taskId: task.id,
      text: data.text,
      messageIds: data.messageIds,
      authorId: actorId,
    });
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.RESULT_SET,
      { taskId: task.id, number: task.number, audience: audienceIds(task), resultId: result.id },
      { actorId, aggregateType: 'task', aggregateId: task.id },
    );
    const fileCount = snaps.reduce((sum, snap) => sum + snap.attachmentCount, 0);
    return { result, fileCount };
  }
}
