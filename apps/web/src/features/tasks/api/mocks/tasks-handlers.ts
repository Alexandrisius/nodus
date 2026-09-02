import type { ChatMessage } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoTaskMessages, demoTasks, taskDetailOf } from '../../../../shared/mocks/data/tasks.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

export const tasksHandlers = [
  http.get('/api/v1/tasks', () => HttpResponse.json({ items: demoTasks, nextCursor: null })),

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
