import { Inject, Injectable } from '@nestjs/common';
import type {
  StageColor,
  TaskChainNode,
  TaskListItem,
  TaskPriority,
  TaskSource,
  TaskStage,
  TaskSystemState,
  UserRef,
} from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import type { TaskListRow } from './task-row.js';

export type RefMap = Map<string, UserRef>;

const UNKNOWN_USER = (id: string): UserRef => ({ id, displayName: '—', avatarUrl: null });

export function stageDto(s: {
  id: string;
  name: string;
  sortOrder: number;
  systemState: string;
  color: string;
  outcome?: string | null;
}): TaskStage {
  return {
    id: s.id,
    name: s.name,
    order: s.sortOrder,
    systemState: s.systemState as TaskSystemState,
    color: s.color as StageColor,
    ...(s.outcome ? { outcome: s.outcome as 'success' | 'cancelled' } : {}),
  };
}

/** Узел цепочки самой задачи (последний в chain). */
export function selfChainNode(row: {
  id: string;
  number: number;
  title: string;
  stageName: string;
}): TaskChainNode {
  return {
    kind: 'task',
    ref: `ПП-${row.number}`,
    label: row.title,
    state: row.stageName,
    entityId: row.id,
  };
}

/**
 * Строки задач → DTO контракта (projectRef — null до бэкенда проектов,
 * ступень 3: projectId хранится, привязка отдаётся с появлением модуля).
 * Профили — одним батчем через read-порт (ADR-0012).
 */
@Injectable()
export class TaskDtoMapper {
  constructor(@Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader) {}

  async refs(userIds: Iterable<string>, tx?: TransactionClient): Promise<RefMap> {
    const list = await this.profiles.findRefs([...new Set(userIds)], tx);
    return new Map(list.map((r) => [r.id, r]));
  }

  ref(map: RefMap, id: string): UserRef {
    return map.get(id) ?? UNKNOWN_USER(id);
  }

  userIdsOf(rows: TaskListRow[]): string[] {
    return rows.flatMap((r) => [r.creatorId, r.assigneeId, ...r.participants.map((p) => p.userId)]);
  }

  async toListItems(rows: TaskListRow[], tx?: TransactionClient): Promise<TaskListItem[]> {
    const map = await this.refs(this.userIdsOf(rows), tx);
    return rows.map((r) => this.toListItem(r, map));
  }

  toListItem(r: TaskListRow, map: RefMap): TaskListItem {
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      type: r.type,
      stage: stageDto(r.stage),
      personalStageId: r.placements[0]?.stageId ?? null,
      priority: r.priority as TaskPriority,
      deadline: r.deadline?.toISOString() ?? null,
      creator: this.ref(map, r.creatorId),
      assignee: this.ref(map, r.assigneeId),
      participants: r.participants
        .filter((p) => p.role === 'coexecutor')
        .map((p) => this.ref(map, p.userId)),
      project: null,
      parentId: r.parentId,
      spentMinutes: r.spentMinutes,
      commentsCount: r.commentsCount,
      checklistDone: r.checklistDone,
      checklistTotal: r.checklistTotal,
      source: r.source as TaskSource,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
