import type { ChatMessage } from '@nodus/contracts';
import { taskUpdateBodySchema } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  demoSubtasks,
  demoTaskMessages,
  demoTasks,
  makeSubtask,
  taskDetailOf,
} from '../../../../shared/mocks/data/tasks.js';
import { demoStages } from '../../../../shared/mocks/data/task-stages.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

export const tasksHandlers = [
  http.get('/api/v1/tasks', ({ request }) => {
    const url = new URL(request.url);
    const stageId = url.searchParams.get('stageId');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);
    let filtered = stageId ? demoTasks.filter((t) => t.stage.id === stageId) : demoTasks;
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

  http.get('/api/v1/tasks/:id', ({ params }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    return HttpResponse.json(taskDetailOf(task));
  }),

  http.get('/api/v1/tasks/:id/messages', ({ params }) =>
    HttpResponse.json({
      items: demoTaskMessages.filter((m) => m.conversationId === params.id),
      nextCursor: null,
    }),
  ),

  http.post('/api/v1/tasks/:id/subtasks', async ({ params, request }) => {
    const parent = demoTasks.find((t) => t.id === params.id);
    if (!parent)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    const { title } = (await request.json()) as { title: string };
    const subtask = makeSubtask(parent, title);
    (demoSubtasks[parent.id] ??= []).push(subtask);
    return HttpResponse.json(subtask, { status: 201 });
  }),

  http.patch('/api/v1/tasks/:id', async ({ params, request }) => {
    const task = demoTasks.find((t) => t.id === params.id);
    if (!task)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Task not found' }, { status: 404 });
    const parsed = taskUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Invalid body' },
        { status: 422 },
      );
    const stage = demoStages.find((s) => s.id === parsed.data.stageId);
    if (!stage)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'Stage not found' }, { status: 404 });
    task.stage = stage;
    task.updatedAt = new Date().toISOString();
    // Порядок внутри колонки persistится: переставляем в массиве, чтобы
    // refetch не «отщёлкивал» порядок после переноса.
    const from = demoTasks.indexOf(task);
    demoTasks.splice(from, 1);
    const sameStage = demoTasks.filter((t) => t.stage.id === stage.id);
    const at = parsed.data.index;
    const anchor = at !== undefined ? sameStage[at] : undefined;
    const last = sameStage[sameStage.length - 1];
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
