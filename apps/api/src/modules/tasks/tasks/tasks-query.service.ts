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

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import { actorRoles, taskAccess } from '../access/task-access.js';
import { ViewerResolver, visibleTasksWhere, type Viewer } from '../access/task-visibility.js';
import { WorkflowRepository } from '../workflow/workflow.repository.js';
import { selfChainNode, stageDto, TaskDtoMapper } from './task-dto.mapper.js';
import { TasksRepository, type TaskOrder } from './tasks.repository.js';
import { DEFAULT_TASK_WORKFLOW_CODE } from '../catalog/system-catalog.js';
import { CHAT_MESSAGE_ACCESS, type ChatMessageAccess } from '../../chat/message-access.port.js';

const keyCursor = z.object({ o: z.string(), id: z.uuid() });
const numberCursor = z.object({ n: z.number().int() });

/**
 * Чтения задач (CQRS-лайт): списки-фиды обеих осей, деталь, ветка, каталоги
 * стадий со счётчиками. Всё — через ЕДИНУЮ функцию видимости.
 */
@Injectable()
export class TasksQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TasksRepository,
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
    const and: Prisma.TaskWhereInput[] = [visibleTasksWhere(viewer, q.scope)];
    const me = user.id;
    if (q.role === 'assignee') and.push({ assigneeId: me });
    if (q.role === 'creator') and.push({ creatorId: me });
    if (q.role === 'coexecutor' || q.role === 'observer') {
      and.push({ participants: { some: { userId: me, role: q.role } } });
    }
    if (q.stageId) and.push({ stageId: q.stageId });
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
    if (q.parentId) and.push({ parentId: q.parentId });
    if (q.typeId) and.push({ typeId: q.typeId });
    if (q.overdue) {
      and.push({
        deadline: { lt: new Date() },
        systemState: { in: ['backlog', 'active', 'paused'] },
      });
    }
    if (q.search) {
      const n = Number(q.search.replace(/^ПП-/i, ''));
      and.push({
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          ...(Number.isSafeInteger(n) && n > 0 ? [{ number: n }] : []),
        ],
      });
    }
    const order = this.order(q, me);
    const { rows, sortKeys } = await this.repo.list({ AND: and }, order, q.limit, me);
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
      this.prisma.task.findUniqueOrThrow({
        where: { id },
        include: { checklist: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      }),
      this.repo.list(
        { AND: [{ parentId: id }, visibleTasksWhere(viewer, 'all')] },
        { kind: 'number' },
        200,
        user.id,
      ),
      this.prisma.taskResult.findFirst({ where: { taskId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const observerIds = row.participants.filter((p) => p.role === 'observer').map((p) => p.userId);
    const refs = await this.mapper.refs([
      ...this.mapper.userIdsOf([row, ...children.rows]),
      ...observerIds,
      ...(result ? [result.authorId] : []),
    ]);
    const origin = [
      ...((full.origin as TaskChainNode[] | null) ?? []),
      ...(full.source === 'chat_message' && full.sourceId
        ? [await this.messageNode(full.sourceId, user.id)]
        : []),
    ];
    return {
      ...this.mapper.toListItem(row, refs),
      description: full.description,
      observers: observerIds.map((uid) => this.mapper.ref(refs, uid)),
      checklist: full.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
      subtasks: children.rows
        .sort((a, b) => a.number - b.number)
        .map((c) => this.mapper.toListItem(c, refs)),
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
      const node = await this.prisma.task.findUnique({
        where: { id: rootId },
        select: { parentId: true },
      });
      if (!node?.parentId) break;
      rootId = node.parentId;
    }
    const nodes = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM tasks WHERE id = ${rootId}::uuid
        UNION SELECT t.id FROM tasks t JOIN tree ON t.parent_id = tree.id WHERE t.deleted_at IS NULL
      ) SELECT id FROM tree`;
    const ids = nodes.map((n) => n.id);
    const [rows, visible] = await Promise.all([
      this.prisma.task.findMany({
        where: { id: { in: ids } },
        include: { stage: true },
        orderBy: { number: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { AND: [{ id: { in: ids } }, visibleTasksWhere(viewer, 'all')] },
        select: { id: true },
      }),
    ]);
    const seen = new Set(visible.map((v) => v.id));
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
    const workflow = await this.prisma.workflow.findUniqueOrThrow({
      where: { code: DEFAULT_TASK_WORKFLOW_CODE },
    });
    const stages = await this.prisma.workflowStage.findMany({
      where: { workflowId: workflow.id, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const counts = await this.repo.stageCounts(visibleTasksWhere(viewer, scope), new Date());
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
