import { Inject, Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type AuthUser,
  type TaskResult,
  type TaskResultCreateBody,
} from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { actorRoles, audienceIds, taskAccess } from '../access/task-access.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';

/** Результат задачи: append-only ревизии (текущий — последняя); пишут
 *  постановщик, ответственный, соисполнители (canCheck). */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly query: TasksQueryService,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly messages: ChatMessageAccess,
  ) {}

  async list(user: AuthUser, taskId: string): Promise<TaskResult[]> {
    await this.query.visibleRow(user, taskId);
    const rows = await this.prisma.taskResult.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
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
    // Закрепить можно только сообщение, которое автор видит сам (иначе
    // результат стал бы окном в чужую беседу — находка security-гейта #37;
    // #252 сузит до беседы самой задачи).
    for (const messageId of new Set(body.messageIds ?? [])) {
      if (!(await this.messages.snapshot(messageId, user.id))) {
        throw DomainException.notFound('Message not found');
      }
    }
    const created = await this.txRunner.run(async (tx) => {
      const result = await tx.taskResult.create({
        data: {
          taskId,
          text: body.text,
          messageIds: (body.messageIds ?? []) as Prisma.InputJsonValue,
          authorId: user.id,
        },
      });
      await this.eventBus.emit(
        tx,
        TASK_EVENTS.RESULT_SET,
        { taskId, number: row.number, audience: audienceIds(row), resultId: result.id },
        { actorId: user.id, aggregateType: 'task', aggregateId: taskId },
      );
      return result;
    });
    const [author] = await this.profiles.findRefs([user.id]);
    return {
      id: created.id,
      text: created.text,
      messageIds: body.messageIds ?? [],
      author: author ?? { id: user.id, displayName: user.displayName, avatarUrl: null },
      createdAt: created.createdAt.toISOString(),
    };
  }
}
