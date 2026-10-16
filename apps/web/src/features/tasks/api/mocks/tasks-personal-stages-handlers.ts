import {
  ErrorCode,
  personalStageCreateBodySchema,
  personalStageUpdateBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  deletePersonalStagePure,
  demoPersonalStages,
  demoTasks,
} from '../../../../shared/mocks/data/tasks.js';

function notFound(message: string) {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

function invalidBody() {
  return HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );
}

/** Личная схема «Мой план» (ADR-0008): каталог колонок со счётчиками и CRUD
 *  колонок (последнюю удалить нельзя — TASK_LAST_STAGE; задачи удаляемой —
 *  в первую колонку того же состояния). Маршруты personal-stages в реестре
 *  домена (tasks-handlers) стоят ДО '/api/v1/tasks/:id' — иначе :id захватил
 *  бы их. */
export const tasksPersonalStagesHandlers = [
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
    if (!parsed.success) return invalidBody();
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
    if (!parsed.success) return invalidBody();
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
];
