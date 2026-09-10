import type { ChatMessage, ConversationListItem, TaskListItem } from '@nodus/contracts';
import { ErrorCode, sendMessageBodySchema, startDirectBodySchema } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';
import { isoIn } from '../../../../shared/mocks/data/dates.js';
import { demoTasks, personalNew, stageNew, tid } from '../../../../shared/mocks/data/tasks.js';
import {
  currentAuthUser,
  demoUserListItems,
  userRef,
} from '../../../../shared/mocks/data/users.js';

let chatTaskSeq = 60;

export const chatHandlers = [
  http.get('/api/v1/chat/conversations', () =>
    HttpResponse.json({ items: demoConversations, nextCursor: null }),
  ),

  /** «Написать сообщение» из карточки сотрудника: найти или создать диалог
   * (startDirectBodySchema — идемпотентно по участнику). */
  http.post('/api/v1/chat/conversations', async ({ request }) => {
    const parsed = startDirectBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const existing = demoConversations.find(
      (c) => c.type === 'direct' && c.membersPreview.some((m) => m.id === parsed.data.userId),
    );
    if (existing) return HttpResponse.json(existing);
    const person = demoUserListItems.find((u) => u.id === parsed.data.userId);
    if (!person)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'User not found' },
        { status: 404 },
      );
    const conversation: ConversationListItem = {
      id: crypto.randomUUID(),
      type: 'direct',
      title: null,
      avatarUrl: null,
      project: null,
      task: null,
      membersPreview: [userRef(person.id)],
      lastMessage: null,
      unreadCount: 0,
    };
    demoConversations.push(conversation);
    return HttpResponse.json(conversation, { status: 201 });
  }),

  /** Сообщения беседы; с threadRootId — тред канала: корень + ответы
   * (ровно один уровень, корень первым). */
  http.get('/api/v1/chat/conversations/:id/messages', ({ params, request }) => {
    const threadRootId = new URL(request.url).searchParams.get('threadRootId');
    const all = demoMessages.filter((m) => m.conversationId === params.id);
    const items = threadRootId
      ? [
          ...all.filter((m) => m.id === threadRootId),
          ...all.filter((m) => m.threadRootId === threadRootId),
        ]
      : all;
    return HttpResponse.json({ items, nextCursor: null });
  }),

  /** Отправка сообщения (sendMessageBodySchema): в тред — с threadRootId,
   * счётчик ответов корня растёт (лента канала читает его без загрузки треда). */
  http.post('/api/v1/chat/conversations/:id/messages', async ({ params, request }) => {
    const parsed = sendMessageBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const threadRootId = parsed.data.threadRootId ?? null;
    if (threadRootId && !demoMessages.some((m) => m.id === threadRootId)) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Thread root not found' },
        { status: 404 },
      );
    }
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: String(params.id),
      author: userRef(currentAuthUser.id),
      text: parsed.data.text,
      replyToId: null,
      threadRootId,
      threadRepliesCount: 0,
      reactions: [],
      attachments: [],
      editedAt: null,
      createdAt: new Date().toISOString(),
    };
    demoMessages.push(message);
    if (threadRootId) {
      const root = demoMessages.find((m) => m.id === threadRootId);
      if (root) root.threadRepliesCount += 1;
    }
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (conversation && !threadRootId) conversation.lastMessage = message;
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
      personalStageId: personalNew.id,
      priority: 'normal',
      deadline: isoIn(3),
      creator: userRef(currentAuthUser.id),
      assignee: userRef(currentAuthUser.id),
      participants: [message.author],
      project: conversation?.project ?? null,
      parentId: null,
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
