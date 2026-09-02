import type { ChatMessage, TaskListItem } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';
import { isoIn } from '../../../../shared/mocks/data/dates.js';
import { demoTasks, stageNew, tid } from '../../../../shared/mocks/data/tasks.js';
import { currentAuthUser, userRef } from '../../../../shared/mocks/data/users.js';

let chatTaskSeq = 60;

export const chatHandlers = [
  http.get('/api/v1/chat/conversations', () =>
    HttpResponse.json({ items: demoConversations, nextCursor: null }),
  ),

  http.get('/api/v1/chat/conversations/:id/messages', ({ params }) =>
    HttpResponse.json({
      items: demoMessages.filter((m) => m.conversationId === params.id),
      nextCursor: null,
    }),
  ),

  http.post('/api/v1/chat/conversations/:id/messages', async ({ params, request }) => {
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
    demoMessages.push(message);
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (conversation) conversation.lastMessage = message;
    return HttpResponse.json(message, { status: 201 });
  }),

  /** Поток Б: сообщение → задача с предзаполненным описанием и ссылкой на переписку. */
  http.post('/api/v1/chat/conversations/:id/messages/:messageId/to-task', ({ params }) => {
    const message = demoMessages.find((m) => m.id === params.messageId);
    if (!message)
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'Message not found' },
        { status: 404 },
      );
    const conversation = demoConversations.find((c) => c.id === params.id);
    const task: TaskListItem = {
      id: tid(chatTaskSeq),
      number: 300 + chatTaskSeq,
      title: message.text.slice(0, 80),
      stage: stageNew,
      priority: 'normal',
      deadline: isoIn(3),
      creator: userRef(currentAuthUser.id),
      assignee: userRef(currentAuthUser.id),
      participants: [message.author],
      project: conversation?.project ?? null,
      spentMinutes: 0,
      commentsCount: 0,
      checklistDone: 0,
      checklistTotal: 0,
      source: 'chat_message',
      updatedAt: new Date().toISOString(),
    };
    chatTaskSeq += 1;
    demoTasks.unshift(task);
    return HttpResponse.json(task, { status: 201 });
  }),
];
