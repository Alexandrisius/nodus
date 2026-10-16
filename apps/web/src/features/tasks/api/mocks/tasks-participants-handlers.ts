import { ErrorCode, taskParticipantAddBodySchema } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoTasks, detailsExtra, taskDetailOf } from '../../../../shared/mocks/data/tasks.js';
import { userRef } from '../../../../shared/mocks/data/users.js';

function notFound(message: string) {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

/** Участники (#252/#311): соисполнитель — в `participants`, наблюдатель —
 *  в `observers` детали; повторное добавление меняет роль. */
export const tasksParticipantsHandlers = [
  http.post('/api/v1/tasks/:id/participants', async ({ params, request }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    const parsed = taskParticipantAddBodySchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.userId === task.assignee?.id)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 400 },
      );
    const extra = (detailsExtra[task.id] ??= {
      description: taskDetailOf(task).description,
      observers: [],
      checklist: [],
      createdAt: task.updatedAt,
    });
    const { userId, role } = parsed.data;
    task.participants = task.participants.filter((p) => p.id !== userId);
    extra.observers = extra.observers.filter((p) => p.id !== userId);
    if (role === 'coexecutor') task.participants.push(userRef(userId));
    else extra.observers.push(userRef(userId));
    return HttpResponse.json(taskDetailOf(task), { status: 201 });
  }),

  http.delete('/api/v1/tasks/:id/participants/:userId', ({ params }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    const userId = String(params.userId);
    task.participants = task.participants.filter((p) => p.id !== userId);
    const extra = detailsExtra[task.id];
    if (extra) extra.observers = extra.observers.filter((p) => p.id !== userId);
    return HttpResponse.json(taskDetailOf(task));
  }),
];
