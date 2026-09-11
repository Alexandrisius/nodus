import type {
  ChatMessage,
  Paginated,
  TaskBranch,
  TaskBranchNode,
  TaskListItem,
  TaskRelation,
} from '@nodus/contracts';
import {
  ErrorCode,
  createTaskBodySchema,
  personalStageCreateBodySchema,
  personalStageUpdateBodySchema,
  taskUpdateBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  autoMovePersonalPlacement,
  deletePersonalStagePure,
  demoPersonalStages,
  demoSubtasks,
  demoTaskMessages,
  demoTasks,
  globalStageForPersonal,
  makeSubtask,
  taskDetailOf,
} from '../../../../shared/mocks/data/tasks.js';
import { demoProjects } from '../../../../shared/mocks/data/projects.js';
import { demoStages } from '../../../../shared/mocks/data/task-stages.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

function notFound(message: string) {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

/** Дети узла ветки: общий список + свежесозданные подзадачи (demoSubtasks),
 *  дедуп по id (kjSubtask живёт в обоих). Порядок = порядок создания. */
function childrenOf(id: string): TaskListItem[] {
  const seen = new Set<string>();
  return [...demoTasks.filter((t) => t.parentId === id), ...(demoSubtasks[id] ?? [])].filter((t) =>
    seen.has(t.id) ? false : (seen.add(t.id), true),
  );
}

function branchNodeOf(task: TaskListItem): TaskBranchNode {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    stageName: task.stage.name,
    stageColor: task.stage.color,
    systemState: task.stage.systemState,
    children: childrenOf(task.id).map(branchNodeOf),
  };
}

export const tasksHandlers = [
  http.get('/api/v1/tasks', ({ request }) => {
    const url = new URL(request.url);
    const stageId = url.searchParams.get('stageId');
    const personalStageId = url.searchParams.get('personalStageId');
    const projectId = url.searchParams.get('projectId');
    const assigneeId = url.searchParams.get('assigneeId');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);
    let filtered = stageId ? demoTasks.filter((t) => t.stage.id === stageId) : demoTasks;
    if (personalStageId) {
      filtered = demoTasks.filter((t) => t.personalStageId === personalStageId);
    }
    if (projectId) {
      filtered = filtered.filter((t) => t.project?.id === projectId);
    }
    if (assigneeId) {
      filtered = filtered.filter((t) => t.assignee?.id === assigneeId);
    }
    if (search) {
      filtered = filtered.filter(
        (t) => t.title.toLowerCase().includes(search) || String(t.number).includes(search),
      );
    }
    const start = cursor ? Number(cursor) || 0 : 0;
    const items = filtered.slice(start, start + limit);
    const next = start + limit < filtered.length ? String(start + limit) : null;
    return HttpResponse.json({ items, nextCursor: next });
  }),

  http.get('/api/v1/tasks/stages', () =>
    HttpResponse.json(
      demoStages.map((s) => ({
        ...s,
        count: demoTasks.filter((t) => t.stage.id === s.id).length,
        overdueCount: demoTasks.filter(
          (t) =>
            t.stage.id === s.id &&
            t.deadline !== null &&
            new Date(t.deadline) < new Date() &&
            s.systemState !== 'done' &&
            s.systemState !== 'closed',
        ).length,
      })),
    ),
  ),

  /** Быстрое создание задачи из колонки доски (плюсик в шапке): личная
   *  колонка «Моего плана» — глобальная стадия подставляется по состоянию
   *  колонки; глобальная стадия (проектная доска) — как есть, личное
   *  размещение не создаётся (появится при первом DnD «Моего плана»). */
  http.post('/api/v1/tasks', async ({ request }) => {
    const parsed = createTaskBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const project = parsed.data.projectId
      ? demoProjects.find((p) => p.id === parsed.data.projectId)
      : undefined;
    const personalColumn = parsed.data.personalStageId
      ? demoPersonalStages.find((s) => s.id === parsed.data.personalStageId)
      : undefined;
    if (parsed.data.personalStageId && !personalColumn) return notFound('Stage not found');
    const stage = personalColumn
      ? globalStageForPersonal(personalColumn, demoStages)
      : demoStages.find((s) => s.id === parsed.data.stageId);
    if (!stage) return notFound('Stage not found');
    const task: TaskListItem = {
      id: crypto.randomUUID(),
      number: Math.max(...demoTasks.map((t) => t.number)) + 1,
      title: parsed.data.title,
      stage,
      personalStageId: personalColumn?.id ?? null,
      priority: 'normal',
      deadline: null,
      creator: userRef(currentAuthUser.id),
      assignee: userRef(currentAuthUser.id),
      participants: [],
      project: project ? { id: project.id, code: project.code, name: project.name } : null,
      parentId: null,
      spentMinutes: 0,
      commentsCount: 0,
      checklistDone: 0,
      checklistTotal: 0,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
    demoTasks.push(task);
    return HttpResponse.json(task, { status: 201 });
  }),

  // Личная схема «Мой план» (ADR-0008): каталог колонок со счётчиками.
  // Маршруты personal-stages — ДО '/api/v1/tasks/:id' (:id захватил бы их).
  http.get('/api/v1/tasks/personal-stages', () =>
    HttpResponse.json(
      demoPersonalStages.map((s) => ({
        ...s,
        count: demoTasks.filter((t) => t.personalStageId === s.id).length,
        overdueCount: demoTasks.filter(
          (t) =>
            t.personalStageId === s.id &&
            t.deadline !== null &&
            new Date(t.deadline) < new Date() &&
            s.systemState !== 'done' &&
            s.systemState !== 'closed',
        ).length,
      })),
    ),
  ),

  http.post('/api/v1/tasks/personal-stages', async ({ request }) => {
    const parsed = personalStageCreateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const stage = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      color: parsed.data.color,
      systemState: parsed.data.systemState,
      order: Math.max(...demoPersonalStages.map((s) => s.order), -1) + 1,
    };
    demoPersonalStages.push(stage);
    return HttpResponse.json(stage, { status: 201 });
  }),

  http.patch('/api/v1/tasks/personal-stages/:stageId', async ({ params, request }) => {
    const stage = demoPersonalStages.find((s) => s.id === params.stageId);
    if (!stage) return notFound('Stage not found');
    const parsed = personalStageUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    Object.assign(stage, parsed.data);
    return HttpResponse.json(stage);
  }),

  http.delete('/api/v1/tasks/personal-stages/:stageId', ({ params }) => {
    const result = deletePersonalStagePure(demoPersonalStages, demoTasks, String(params.stageId));
    if (!result.ok) {
      return HttpResponse.json(
        { code: ErrorCode.TASK_LAST_STAGE, message: 'Last personal stage cannot be deleted' },
        { status: 409 },
      );
    }
    return HttpResponse.json({ ok: true, movedToStageId: result.movedTo?.id });
  }),

  http.get('/api/v1/tasks/:id', ({ params }) => {
    const task =
      demoTasks.find((t) => t.id === params.id) ??
      // Свежесозданные подзадачи живут в demoSubtasks (не в общем списке).
      Object.values(demoSubtasks)
        .flat()
        .find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    return HttpResponse.json(taskDetailOf(task));
  }),

  /** Ветка задачи для панели-навигатора: дерево от корневого предка. */
  http.get('/api/v1/tasks/:id/branch', ({ params }) => {
    let task = demoTasks.find((t) => t.id === params.id);
    if (!task) {
      // Свежесозданные подзадачи живут в demoSubtasks (не в общем списке).
      task = Object.values(demoSubtasks)
        .flat()
        .find((t) => t.id === params.id);
    }
    if (!task) return notFound('Task not found');
    let root = task;
    while (root.parentId) {
      const parent =
        demoTasks.find((t) => t.id === root.parentId) ??
        Object.values(demoSubtasks)
          .flat()
          .find((t) => t.id === root.parentId);
      if (!parent) break;
      root = parent;
    }
    return HttpResponse.json({ root: branchNodeOf(root) } satisfies TaskBranch);
  }),

  /** Связи задачи (поле «Отношения», вкладка «Связи» навигатора ветки) —
   *  заготовка под зависимости Ганта (#39): пока пусто, вкладка — Empty. */
  http.get('/api/v1/tasks/:id/relations', () =>
    HttpResponse.json({ items: [], nextCursor: null } satisfies Paginated<TaskRelation>),
  ),

  http.get('/api/v1/tasks/:id/messages', ({ params }) =>
    HttpResponse.json({
      items: demoTaskMessages.filter((m) => m.conversationId === params.id),
      nextCursor: null,
    }),
  ),

  http.post('/api/v1/tasks/:id/subtasks', async ({ params, request }) => {
    const parent = demoTasks.find((t) => t.id === params.id);
    if (!parent) return notFound('Task not found');
    const { title } = (await request.json()) as { title: string };
    const subtask = makeSubtask(parent, title);
    (demoSubtasks[parent.id] ??= []).push(subtask);
    return HttpResponse.json(subtask, { status: 201 });
  }),

  http.patch('/api/v1/tasks/:id', async ({ params, request }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    const parsed = taskUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );

    // Перенос по личной оси («Мой план»): глобальная стадия не трогается.
    const columnId = parsed.data.personalStageId ?? parsed.data.stageId;
    const column = parsed.data.personalStageId
      ? demoPersonalStages.find((s) => s.id === columnId)
      : demoStages.find((s) => s.id === columnId);
    if (!column) return notFound('Stage not found');

    if (parsed.data.stageId) {
      task.stage = column;
      // Встроенное автоперемещение личной доски (ADR-0008): смена системного
      // состояния переезжает карточку в первую личную колонку этого состояния.
      autoMovePersonalPlacement(task, demoPersonalStages);
    } else {
      task.personalStageId = column.id;
    }
    task.updatedAt = new Date().toISOString();

    // Порядок внутри колонки persistится: переставляем в массиве, чтобы
    // refetch не «отщёлкивал» порядок после переноса.
    const sameColumn = (t: TaskListItem) =>
      parsed.data.personalStageId ? t.personalStageId === column.id : t.stage.id === column.id;
    const from = demoTasks.indexOf(task);
    demoTasks.splice(from, 1);
    const siblings = demoTasks.filter(sameColumn);
    const at = parsed.data.index;
    const anchor = at !== undefined ? siblings[at] : undefined;
    const last = siblings[siblings.length - 1];
    if (anchor) demoTasks.splice(demoTasks.indexOf(anchor), 0, task);
    else if (last) demoTasks.splice(demoTasks.indexOf(last) + 1, 0, task);
    else demoTasks.push(task);
    return HttpResponse.json(task);
  }),

  http.post('/api/v1/tasks/:id/messages', async ({ params, request }) => {
    const { text } = (await request.json()) as { text: string };
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: String(params.id),
      author: userRef(currentAuthUser.id),
      text,
      replyToId: null,
      threadRootId: null,
      threadRepliesCount: 0,
      reactions: [],
      attachments: [],
      editedAt: null,
      createdAt: new Date().toISOString(),
    };
    demoTaskMessages.push(message);
    return HttpResponse.json(message, { status: 201 });
  }),
];
