import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  AuthUser,
  ListTasksQuery,
  Paginated,
  TaskBranch,
  TaskBranchNode,
  TaskChainNode,
  TaskDetail,
  TaskListItem,
  TaskStageWithCount,
  TaskType,
} from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import { actorRoles, taskAccess } from '../access/task-access.js';
import { ViewerResolver, visibleTasksWhere, type Viewer } from '../access/task-visibility.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { selfChainNode, stageDto, TaskDtoMapper } from './task-dto.mapper.js';
import { TasksQueryRepository, type TaskOrder } from './tasks-query.repository.js';
import { TasksRepository } from './tasks.repository.js';
import { DEFAULT_TASK_WORKFLOW_CODE } from '../catalog/system-catalog.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';
import { ResultsRepository } from '../activity/results.repository.js';

const keyCursor = z.object({ o: z.string(), id: z.uuid() });
const numberCursor = z.object({ n: z.number().int() });
/** Потолок подзадач в карточке (ранние — первыми, порядок номеров). */
const SUBTASKS_LIMIT = 200;

/**
 * Чтения задач (CQRS-лайт): списки-фиды обеих осей, деталь, ветка, каталоги
 * стадий со счётчиками. Всё — через ЕДИНУЮ функцию видимости.
 */
@Injectable()
export class TasksQueryService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly reads: TasksQueryRepository,
    private readonly results: ResultsRepository,
    private readonly workflows: WorkflowRepository,
    private readonly viewers: ViewerResolver,
    private readonly mapper: TaskDtoMapper,
    @Inject(CHAT_MESSAGE_ACCESS) private readonly messages: ChatMessageAccess,
  ) {}

  viewer(user: Pick<AuthUser, 'id' | 'permissions'>): Promise<Viewer> {
    return this.viewers.resolve(user);
  }

  /** Задача, видимая пользователю, или 404 (чужое = «не найдено», без утечки). */
  async visibleRow(user: Pick<AuthUser, 'id' | 'permissions'>, id: string) {
    const viewer = await this.viewer(user);
    const row = await this.repo.findOne(
      { AND: [{ id }, visibleTasksWhere(viewer, 'all')] },
      user.id,
    );
    if (!row) throw DomainException.notFound('Task not found');
    return row;
  }

  async list(user: AuthUser, q: ListTasksQuery): Promise<Paginated<TaskListItem>> {
    const viewer = await this.viewer(user);
    const me = user.id;
    const order = this.order(q, me);
    const { rows, sortKeys } = await this.reads.list(
      { AND: [visibleTasksWhere(viewer, q.scope), ...this.reads.feedFilters(q, me, new Date())] },
      order,
      q.limit,
      me,
    );
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    let nextCursor: string | null = null;
    if (rows.length > q.limit && last) {
      nextCursor =
        order.kind === 'number'
          ? encodeCursor({ n: last.number })
          : encodeCursor({ o: sortKeys.get(last.id)!, id: last.id });
    }
    return { items: await this.mapper.toListItems(page), nextCursor };
  }

  private order(q: ListTasksQuery, me: string): TaskOrder {
    if (q.personalStageId) {
      const after = q.cursor ? decodeCursor(q.cursor, keyCursor) : undefined;
      return { kind: 'personal', userId: me, stageId: q.personalStageId, after };
    }
    if (q.stageId) {
      return { kind: 'stage', after: q.cursor ? decodeCursor(q.cursor, keyCursor) : undefined };
    }
    return { kind: 'number', after: q.cursor ? decodeCursor(q.cursor, numberCursor) : undefined };
  }

  async detail(user: AuthUser, id: string): Promise<TaskDetail> {
    const row = await this.visibleRow(user, id);
    const viewer = await this.viewer(user);
    const [full, children, result] = await Promise.all([
      this.reads.findDetail(id),
      this.reads.listSubtasks(id, visibleTasksWhere(viewer, 'all'), SUBTASKS_LIMIT, user.id),
      this.results.findCurrent(id),
    ]);
    const observerIds = row.participants.filter((p) => p.role === 'observer').map((p) => p.userId);
    const refs = await this.mapper.refs([
      ...this.mapper.userIdsOf([row, ...children]),
      ...observerIds,
      ...(result ? [result.authorId] : []),
    ]);
    const origin = [
      // Узлы чата строятся только при чтении (по правам смотрящего); старые
      // снимки в origin, если есть, не отдаются (security-гейт #37, р.3).
      ...((full.origin as TaskChainNode[] | null) ?? []).filter((n) => n.kind !== 'chat_message'),
      ...(full.source === 'chat_message' && full.sourceId
        ? [await this.messageNode(full.sourceId, user.id)]
        : []),
    ];
    return {
      ...this.mapper.toListItem(row, refs),
      description: full.description,
      observers: observerIds.map((uid) => this.mapper.ref(refs, uid)),
      checklist: full.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
      subtasks: children.map((c) => this.mapper.toListItem(c, refs)),
      chain: [...origin, selfChainNode({ ...row, stageName: row.stage.name })],
      plannedMinutes: full.plannedMinutes,
      acceptRequired: full.acceptRequired,
      result: result
        ? {
            id: result.id,
            text: result.text,
            messageIds: result.messageIds as string[],
            author: this.mapper.ref(refs, result.authorId),
            createdAt: result.createdAt.toISOString(),
          }
        : null,
      completedAt: full.completedAt?.toISOString() ?? null,
      access: taskAccess(actorRoles(row, user.id), user.permissions),
      createdAt: full.createdAt.toISOString(),
    };
  }

  /** Узел «сообщение чата» цепочки — по правам СМОТРЯЩЕГО: участник беседы
   *  видит её название и выдержку, остальные — нейтральную заглушку (снимок
   *  не хранится в задаче — иначе «В задачу» пересылал бы закрытую беседу
   *  исполнителю вне неё; security-гейт #37, р.2). */
  private async messageNode(messageId: string, viewerId: string): Promise<TaskChainNode> {
    const snap = await this.messages.snapshot(messageId, viewerId);
    return snap
      ? {
          kind: 'chat_message',
          ref: snap.conversationTitle ?? 'Чат',
          label: snap.excerpt || 'Сообщение чата',
          entityId: snap.conversationId,
        }
      : { kind: 'chat_message', ref: 'Чат', label: 'Сообщение чата' };
  }

  /** Ветка от корневого предка; невидимые узлы маскируются (номер без названия). */
  async branch(user: AuthUser, id: string): Promise<TaskBranch> {
    await this.visibleRow(user, id);
    const viewer = await this.viewer(user);
    let rootId = id;
    for (let guard = 0; guard < 50; guard++) {
      const parentId = await this.reads.parentIdOf(rootId);
      if (!parentId) break;
      rootId = parentId;
    }
    const ids = await this.reads.subtreeIds(rootId);
    const [rows, visible] = await Promise.all([
      this.reads.branchRows(ids),
      this.reads.visibleIdsAmong(ids, visibleTasksWhere(viewer, 'all')),
    ]);
    const seen = new Set(visible);
    const build = (nodeId: string): TaskBranchNode => {
      const r = rows.find((x) => x.id === nodeId)!;
      return {
        id: r.id,
        number: r.number,
        title: seen.has(r.id) ? r.title : `ПП-${r.number}`,
        stageName: r.stage.name,
        stageColor: stageDto(r.stage).color,
        systemState: stageDto(r.stage).systemState,
        children: rows.filter((c) => c.parentId === r.id).map((c) => build(c.id)),
      };
    };
    return { root: build(rootId) };
  }

  /** Каталог стадий маршрута по умолчанию со счётчиками (scope как у фида). */
  async stages(user: AuthUser, scope: 'mine' | 'all'): Promise<TaskStageWithCount[]> {
    const viewer = await this.viewer(user);
    const stages = await this.workflows.liveStagesByCode(DEFAULT_TASK_WORKFLOW_CODE);
    const counts = await this.reads.stageCounts(visibleTasksWhere(viewer, scope), new Date());
    return stages.map((s) => ({
      ...stageDto(s),
      count: counts.all.find((c) => c.stageId === s.id)?._count._all ?? 0,
      overdueCount: counts.overdue.find((c) => c.stageId === s.id)?._count._all ?? 0,
    }));
  }

  async types(): Promise<TaskType[]> {
    const rows = await this.workflows.listTypes();
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      structural: t.structural,
      isSystem: t.isSystem,
    }));
  }
}
