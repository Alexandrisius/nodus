import { Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type AuthUser,
  type ChecklistItem,
  type ChecklistItemCreateBody,
  type ChecklistItemUpdateBody,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { actorRoles, audienceIds, taskAccess } from '../access/task-access.js';
import { TasksQueryService } from '../tasks/tasks-query.service.js';
import { ChecklistRepository } from './checklist.repository.js';

/**
 * Чек-лист задачи: правка состава — canEdit, отметка — canCheck
 * (соисполнители тоже). checklistDone/Total денормализуются в той же tx
 * (гейт checklist_complete и счётчики карточек).
 */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly query: TasksQueryService,
    private readonly repo: ChecklistRepository,
  ) {}

  private async access(user: AuthUser, taskId: string) {
    const row = await this.query.visibleRow(user, taskId);
    return { row, access: taskAccess(actorRoles(row, user.id), user.permissions) };
  }

  async add(user: AuthUser, taskId: string, body: ChecklistItemCreateBody): Promise<ChecklistItem> {
    const { row, access } = await this.access(user, taskId);
    if (!access.canEdit) throw DomainException.forbidden('Checklist edit not allowed');
    return this.txRunner.run(async (tx) => {
      const item = await this.repo.append(tx, taskId, body.text);
      await this.recount(tx, user.id, row);
      return { id: item.id, text: item.text, done: item.done };
    });
  }

  async update(
    user: AuthUser,
    taskId: string,
    itemId: string,
    body: ChecklistItemUpdateBody,
  ): Promise<ChecklistItem> {
    const { row, access } = await this.access(user, taskId);
    const editsText = body.text !== undefined || body.index !== undefined;
    if ((editsText && !access.canEdit) || (body.done !== undefined && !access.canCheck)) {
      throw DomainException.forbidden('Checklist change not allowed');
    }
    return this.txRunner.run(async (tx) => {
      const found = await this.repo.findInTask(tx, taskId, itemId);
      if (!found) throw DomainException.notFound('Checklist item not found');
      const sortOrder =
        body.index !== undefined
          ? await this.repo.keyAt(tx, taskId, itemId, body.index)
          : undefined;
      const item = await this.repo.update(tx, itemId, {
        ...(body.text !== undefined ? { text: body.text } : {}),
        ...(sortOrder ? { sortOrder } : {}),
        ...(body.done !== undefined
          ? {
              done: body.done,
              doneBy: body.done ? user.id : null,
              doneAt: body.done ? new Date() : null,
            }
          : {}),
      });
      await this.recount(tx, user.id, row);
      return { id: item.id, text: item.text, done: item.done };
    });
  }

  async remove(user: AuthUser, taskId: string, itemId: string): Promise<void> {
    const { row, access } = await this.access(user, taskId);
    if (!access.canEdit) throw DomainException.forbidden('Checklist edit not allowed');
    await this.txRunner.run(async (tx) => {
      const count = await this.repo.removeFromTask(tx, taskId, itemId);
      if (count === 0) throw DomainException.notFound('Checklist item not found');
      await this.recount(tx, user.id, row);
    });
  }

  private async recount(
    tx: TransactionClient,
    actorId: string,
    row: {
      id: string;
      number: number;
      creatorId: string;
      assigneeId: string;
      participants: { userId: string; role: string }[];
    },
  ): Promise<void> {
    const { total, done } = await this.repo.recount(tx, row.id);
    await this.eventBus.emit(
      tx,
      TASK_EVENTS.CHECKLIST_CHANGED,
      { taskId: row.id, number: row.number, audience: audienceIds(row), done, total },
      { actorId, aggregateType: 'task', aggregateId: row.id },
    );
  }
}
