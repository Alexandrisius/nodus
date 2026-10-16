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
import { demoStages } from '../../../../shared/mocks/data/task-stages.js';

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

const OPEN = new Set(['backlog', 'active', 'paused']);

/** Мок-маршрут (ADR-0020, свободная линейная схема демо-мира): из текущей
 *  стадии — в любую другую; имена кнопок — как у системного маршрута
 *  бэкенда («Начать», «Завершить», «Вернуть в работу»). Гейтов в моке нет. */
function transitionsOf(task: TaskListItem): TaskTransition[] {
  const from = task.stage.systemState;
  return demoStages
    .filter((s) => s.id !== task.stage.id)
    .map((s) => ({
      id: transitionId(s),
      name:
        OPEN.has(from) && !OPEN.has(s.systemState)
          ? 'Завершить'
          : !OPEN.has(from) && OPEN.has(s.systemState)
            ? 'Вернуть в работу'
            : s.name,
      toStageId: s.id,
      toStageName: s.name,
      toStageState: s.systemState,
      blockedBy: [],
      canOverride: false,
    }));
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
    const stage = demoStages.find((s) => transitionId(s) === params.transitionId);
    if (!task || !stage) {
      return HttpResponse.json(
        { code: ErrorCode.TASK_TRANSITION_NOT_ALLOWED, message: 'Transition not allowed' },
        { status: 409 },
      );
    }
    task.stage = stage;
    // Встроенное автоперемещение «Моего плана» (ADR-0008) и синхронизация
    // письма-поручения — как у переноса по глобальной оси.
    autoMovePersonalPlacement(task, demoPersonalStages);
    const letterId = letterIdByTaskId(task.id);
    if (letterId) syncLetterWithTasks(letterId);
    task.updatedAt = new Date().toISOString();
    return HttpResponse.json(task);
  }),
];
