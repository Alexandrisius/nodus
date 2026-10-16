import type { TaskListItem, TaskStage } from '@nodus/contracts';
import { ErrorCode, createTaskBodySchema } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  demoPersonalStages,
  demoTasks,
  detailsExtra,
  firstPersonalStageOfState,
  globalStageForPersonal,
} from '../../../../shared/mocks/data/tasks.js';
import { demoProjects } from '../../../../shared/mocks/data/projects.js';
import { demoStages, systemTaskType } from '../../../../shared/mocks/data/task-stages.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

function notFound(message: string) {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

/** Открытые состояния: новая задача стартует только в них (API #37,
 *  security-гейт: создание сразу «завершённой» обходило бы гейты DoD). */
const OPEN_STATES = new Set<TaskStage['systemState']>(['backlog', 'active', 'paused']);

/** Стадия новой задачи — как `TasksService.create` API: явная stageId —
 *  только открытая; личная колонка открытого состояния — первая стадия
 *  схемы того же состояния; иначе (закрытая колонка, без колонки) —
 *  начальная стадия маршрута. */
function initialStageFor(stageId: string | undefined, column: TaskStage | undefined) {
  const starts = demoStages.filter((s) => OPEN_STATES.has(s.systemState));
  const initial = starts[0];
  if (stageId) return starts.find((s) => s.id === stageId);
  if (column && OPEN_STATES.has(column.systemState)) {
    return globalStageForPersonal(column, starts);
  }
  return initial;
}

/** Журнал/фиды колонок, каталог стадий со счётчиками и создание задачи. */
export const tasksListHandlers = [
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
    const stage = initialStageFor(parsed.data.stageId, personalColumn);
    if (!stage) return notFound('Stage not found');
    // Колонка — та, куда кликнули, если её состояние совпало со стадией
    // (закрытая колонка — задача встаёт в первую колонку начального
    // состояния, как placements.sync API).
    const personalStageId = personalColumn
      ? personalColumn.systemState === stage.systemState
        ? personalColumn.id
        : firstPersonalStageOfState(demoPersonalStages, stage.systemState).id
      : null;
    const checklist = (parsed.data.checklist ?? []).map((text) => ({
      id: crypto.randomUUID(),
      text,
      done: false,
    }));
    // Ответственный экспресс-формы; неизвестный id — текущий (userRef кидает
    // на чужом id, мок держим мягким).
    let assignee = userRef(currentAuthUser.id);
    if (parsed.data.assigneeId) {
      try {
        assignee = userRef(parsed.data.assigneeId);
      } catch {
        /* fallback — текущий пользователь */
      }
    }
    const task: TaskListItem = {
      id: crypto.randomUUID(),
      number: Math.max(...demoTasks.map((t) => t.number)) + 1,
      title: parsed.data.title,
      type: systemTaskType,
      stage,
      personalStageId,
      priority: 'normal',
      deadline: parsed.data.deadline ?? null,
      creator: userRef(currentAuthUser.id),
      assignee,
      participants: [],
      project: project
        ? { id: project.id, code: project.code, name: project.name, color: project.color }
        : null,
      parentId: null,
      spentMinutes: 0,
      commentsCount: 0,
      checklistDone: 0,
      checklistTotal: checklist.length,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
    demoTasks.push(task);
    // Деталь (описание/чек-лист экспресс-формы) — карточка видит их сразу.
    detailsExtra[task.id] = {
      description: parsed.data.description?.trim() || 'Описание уточняется постановщиком.',
      observers: [],
      checklist,
      createdAt: task.updatedAt,
    };
    return HttpResponse.json(task, { status: 201 });
  }),
];
