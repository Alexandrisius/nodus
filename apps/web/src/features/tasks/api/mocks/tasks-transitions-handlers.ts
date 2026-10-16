import type { TaskListItem, TaskStage, TaskTransition } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';
import { http, HttpResponse } from 'msw';

import {
  autoMovePersonalPlacement,
  demoPersonalStages,
  demoSubtasks,
  demoTasks,
  detailsExtra,
} from '../../../../shared/mocks/data/tasks.js';
import { letterIdByTaskId, syncLetterWithTasks } from '../../../../shared/mocks/data/letters.js';
import {
  demoStages,
  stageCancelled,
  stageDone,
  stageInProgress,
  stageNew,
  stageOnControl,
  stagePostponed,
} from '../../../../shared/mocks/data/task-stages.js';

/** id перехода мока = id целевой стадии с префиксом 21… (детерминированно). */
const transitionId = (stage: TaskStage) => stage.id.replace(/^20/, '21');

function findTask(id: string): TaskListItem | undefined {
  return (
    demoTasks.find((t) => t.id === id) ??
    Object.values(demoSubtasks)
      .flat()
      .find((t) => t.id === id)
  );
}

/** Переходы маршрута «Задача» — зеркало `DEFAULT_TASK_WORKFLOW.transitions`
 *  каталога API (system-catalog.ts): from null — из любой стадии. Условия
 *  «кто» и гейты в моке не проверяются (демо-пользователь — полный доступ). */
const ROUTE: { name: string; from: TaskStage | null; to: TaskStage }[] = [
  { name: 'Начать', from: stageNew, to: stageInProgress },
  { name: 'Начать', from: stagePostponed, to: stageInProgress },
  { name: 'Завершить', from: stageInProgress, to: stageDone },
  { name: 'Завершить', from: stageNew, to: stageDone },
  { name: 'Принять', from: stageOnControl, to: stageDone },
  { name: 'Вернуть в работу', from: stageOnControl, to: stageInProgress },
  { name: 'Вернуть в работу', from: stageDone, to: stageInProgress },
  { name: 'Отложить', from: stageInProgress, to: stagePostponed },
  { name: 'Отложить', from: stageNew, to: stagePostponed },
  { name: 'Возобновить', from: stageCancelled, to: stageNew },
  { name: 'Отменить', from: null, to: stageCancelled },
];

/** Мок-маршрут (ADR-0020): доступные из текущей стадии переходы каталога;
 *  id перехода — от целевой стадии (из одной стадии в одну цель ведёт не
 *  больше одного перехода). */
function transitionsOf(task: TaskListItem): TaskTransition[] {
  return ROUTE.filter(
    (r) => (r.from === null || r.from.id === task.stage.id) && r.to.id !== task.stage.id,
  ).map((r) => ({
    id: transitionId(r.to),
    name: r.name,
    toStageId: r.to.id,
    toStageName: r.to.name,
    toStageState: r.to.systemState,
    blockedBy: [],
    canOverride: false,
  }));
}

/** Пост-функция `route_if_accept_required` «Завершить»: флаг «Принять
 *  работу после завершения» уводит задачу в «Ждёт контроля». */
function resolveTarget(task: TaskListItem, to: TaskStage): TaskStage {
  const completing = to.id === stageDone.id && task.stage.id !== stageOnControl.id;
  return completing && detailsExtra[task.id]?.acceptRequired ? stageOnControl : to;
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
    const target = transition ? demoStages.find((s) => s.id === transition.toStageId) : undefined;
    if (!task || !target) {
      return HttpResponse.json(
        { code: ErrorCode.TASK_TRANSITION_NOT_ALLOWED, message: 'Transition not allowed' },
        { status: 409 },
      );
    }
    task.stage = resolveTarget(task, target);
    // Встроенное автоперемещение «Моего плана» (ADR-0008) и синхронизация
    // письма-поручения — как у переноса по глобальной оси.
    autoMovePersonalPlacement(task, demoPersonalStages);
    const letterId = letterIdByTaskId(task.id);
    if (letterId) syncLetterWithTasks(letterId);
    task.updatedAt = new Date().toISOString();
    return HttpResponse.json(task);
  }),
];
