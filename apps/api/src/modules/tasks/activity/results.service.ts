import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser, TaskResult, TaskResultCreateBody } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { actorRoles, taskAccess } from '../access/task-access.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';
import { ResultRevisions } from './result-revisions.js';
import { ResultsRepository } from './results.repository.js';

/** Результат задачи: append-only ревизии (текущий — последняя); пишут
 *  постановщик, ответственный, соисполнители (canCheck). */
@Injectable()
export class ResultsService {
  constructor(
    private readonly repo: ResultsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly query: TasksQueryService,
    private readonly revisions: ResultRevisions,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly messages: ChatMessageAccess,
  ) {}

  async list(user: AuthUser, taskId: string): Promise<TaskResult[]> {
    await this.query.visibleRow(user, taskId);
    const rows = await this.repo.listRecent(taskId, 50);
    const refs = new Map(
      (await this.profiles.findRefs(rows.map((r) => r.authorId))).map((r) => [r.id, r]),
    );
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      messageIds: r.messageIds as string[],
      author: refs.get(r.authorId) ?? { id: r.authorId, displayName: '—', avatarUrl: null },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async add(user: AuthUser, taskId: string, body: TaskResultCreateBody): Promise<TaskResult> {
    const row = await this.query.visibleRow(user, taskId);
    if (!taskAccess(actorRoles(row, user.id), user.permissions).canCheck) {
      throw DomainException.forbidden('Result change not allowed');
    }
    const messageIds = [...new Set(body.messageIds ?? [])];
    // Закрепить можно только видимое автору сообщение ИЗ БЕСЕДЫ САМОЙ
    // задачи (иначе результат стал бы ссылкой в чужую переписку, видимой
    // всем, кто видит задачу — security-гейты #37 и #252). Один батч-запрос
    // вместо N вызовов порта (#380), чтение — в транзакции записи (gotcha
    // realtime: чтение мимо tx-клиента занимает второе соединение пула).
    const created = await this.txRunner.run(async (tx) => {
      const snaps = await this.messages.taskMessages(taskId, messageIds, user.id, tx);
      if (snaps.length !== messageIds.length) {
        throw DomainException.notFound('Message not found');
      }
      return this.revisions.create(tx, user.id, row, { text: body.text, messageIds }, snaps);
    });
    const [author] = await this.profiles.findRefs([user.id]);
    return {
      id: created.result.id,
      text: created.result.text,
      messageIds,
      author: author ?? { id: user.id, displayName: user.displayName, avatarUrl: null },
      createdAt: created.result.createdAt.toISOString(),
    };
  }
}
