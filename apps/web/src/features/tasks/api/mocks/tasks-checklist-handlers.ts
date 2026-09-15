import type { TaskListItem } from '@nodus/contracts';
import {
  ErrorCode,
  checklistItemCreateBodySchema,
  checklistItemUpdateBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoTasks, detailsExtra, taskDetailOf } from '../../../../shared/mocks/data/tasks.js';

function notFound(message: string) {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

/** Запись деталей задачи, созданной до первого обращения к чек-листу
 *  (дефолт совпадает с fallback в taskDetailOf). */
function ensureDetails(task: TaskListItem) {
  return (detailsExtra[task.id] ??= {
    description: 'Описание уточняется постановщиком.',
    observers: [],
    checklist: [],
    createdAt: task.updatedAt,
  });
}

function recountChecklist(task: TaskListItem, checklist: { done: boolean }[]) {
  task.checklistTotal = checklist.length;
  task.checklistDone = checklist.filter((i) => i.done).length;
  task.updatedAt = new Date().toISOString();
}

/** Пункты чек-листа карточки (вердикт владельца 15.09.2026: чек-листу —
 *  важное место): добавление и отметка выполнения/правка; счётчики списочного
 *  элемента (бейдж канбана) пересчитываются в той же «транзакции». */
export const tasksChecklistHandlers = [
  http.post('/api/v1/tasks/:id/checklist', async ({ params, request }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    const parsed = checklistItemCreateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const detail = ensureDetails(task);
    detail.checklist.push({ id: crypto.randomUUID(), text: parsed.data.text, done: false });
    recountChecklist(task, detail.checklist);
    return HttpResponse.json(taskDetailOf(task), { status: 201 });
  }),

  http.patch('/api/v1/tasks/:id/checklist/:itemId', async ({ params, request }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task) return notFound('Task not found');
    const parsed = checklistItemUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const detail = ensureDetails(task);
    const item = detail.checklist.find((i) => i.id === params.itemId);
    if (!item) return notFound('Checklist item not found');
    Object.assign(item, parsed.data);
    recountChecklist(task, detail.checklist);
    return HttpResponse.json(taskDetailOf(task));
  }),
];
