import type { TaskListItem, TaskStage, TaskTransition } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';
import { http, HttpResponse } from 'msw';

import {
  autoMovePersonalPlacement,
  demoPersonalStages,
  demoSubtasks,
  demoTasks,
} from '../../../../shared/mocks/data/tasks.js';
import { letterIdByTaskId, syncLetterWithTasks } from '../../../../shared/mocks/data/letters.js';
import { standardDocument } from '../../../../shared/mocks/data/workflows.js';

function findTask(id: string): TaskListItem | undefined {
  return (
    demoTasks.find((t) => t.id === id) ??
    Object.values(demoSubtasks)
      .flat()
      .find((t) => t.id === id)
  );
}

/** Маршрут «Стандартный» ревизии 2 (#378): зеркало `standardDocument`
 *  (workflows.ts ← каталог API system-catalog.ts). Условия «кто» в моке не
 *  проверяются (демо-пользователь — полный доступ), показ (`display`) и
 *  порядок — как у сервера: кнопки статуса по sortOrder, затем «из любого»;
 *  встроенное правило «итог → итог» прячет «Отменить» у закрытых. */
function transitionsOf(task: TaskListItem): TaskTransition[] {
  const closed = task.stage.systemState === 'closed';
  const stageIds = new Set(standardDocument.stages.map((s) => s.id));
  const own: TaskTransition[] = [];
  const anyFrom: TaskTransition[] = [];
  for (const t of standardDocument.transitions) {
    if (!stageIds.has(task.stage.id) || !stageIds.has(t.toStageId)) continue;
    if (t.fromStageId !== null && t.fromStageId !== task.stage.id) continue;
    if (t.fromStageId === null && closed) continue; // «итог → итог» скрыт
    if (t.toStageId === task.stage.id) continue;
    const target = stageDoc(t.toStageId);
    const item: TaskTransition = {
      id: t.id,
      name: t.name,
      toStageId: t.toStageId,
      toStageName: target.name,
      toStageState: target.systemState,
      toStageOutcome: target.outcome,
      display: t.display,
      blockedBy: [],
      canOverride: false,
    };
    (t.fromStageId === null ? anyFrom : own).push(item);
  }
  own.sort((a, b) => orderOf(a.id) - orderOf(b.id));
  return [...own, ...anyFrom];
}

function stageDoc(id: string) {
  return standardDocument.stages.find((s) => s.id === id)!;
}

function orderOf(transitionId: string): number {
  return standardDocument.transitions.find((t) => t.id === transitionId)?.sortOrder ?? 0;
}

/** Пост-эффект `route_if` («Завершить»): постановщик сам себе исполнитель —
 *  цель подменяется (утверждение пропускается, #378). */
function resolveTarget(task: TaskListItem, transition: TaskTransition): TaskStage {
  const doc = standardDocument.transitions.find((t) => t.id === transition.id);
  const routeIf = doc?.rules.postFunctions.find((p) => p.kind === 'route_if');
  if (
    routeIf &&
    routeIf.kind === 'route_if' &&
    task.creator.id === task.assignee?.id &&
    standardDocument.stages.some((s) => s.id === routeIf.toStageId)
  ) {
    const substituted = stageDoc(routeIf.toStageId);
    return { ...substituted, order: substituted.sortOrder };
  }
  const target = stageDoc(transition.toStageId);
  return { ...target, order: target.sortOrder };
}

export const tasksTransitionsHandlers = [
  http.get('/api/v1/tasks/:id/transitions', ({ params }) => {
    const task = findTask(String(params.id));
    if (!task)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Task not found' },
        { status: 404 },
      );
    return HttpResponse.json(transitionsOf(task));
  }),

  http.post('/api/v1/tasks/:id/transitions/:transitionId', ({ params }) => {
    const task = findTask(String(params.id));
    const transition = task
      ? transitionsOf(task).find((t) => t.id === params.transitionId)
      : undefined;
    if (!task || !transition) {
      return HttpResponse.json(
        { code: ErrorCode.TASK_TRANSITION_NOT_ALLOWED, message: 'Transition not allowed' },
        { status: 409 },
      );
    }
    task.stage = resolveTarget(task, transition);
    // Встроенное автоперемещение «Моего плана» (ADR-0008) и синхронизация
    // письма-поручения — как у переноса по глобальной оси.
    autoMovePersonalPlacement(task, demoPersonalStages);
    const letterId = letterIdByTaskId(task.id);
    if (letterId) syncLetterWithTasks(letterId);
    task.updatedAt = new Date().toISOString();
    return HttpResponse.json(task);
  }),
];
