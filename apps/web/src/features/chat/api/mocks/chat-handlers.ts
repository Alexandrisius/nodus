import type {
  ChatMessage,
  ConversationListItem,
  MessageAttachment,
  TaskListItem,
} from '@nodus/contracts';
import {
  conversationUpdateBodySchema,
  createConversationBodySchema,
  ErrorCode,
  readConversationBodySchema,
  saveConversationDraftBodySchema,
  sendMessageBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';
import { isoIn } from '../../../../shared/mocks/data/dates.js';
import { demoTasks, personalNew, stageNew, tid } from '../../../../shared/mocks/data/tasks.js';
import { demoUserListItems, userRef } from '../../../../shared/mocks/data/users.js';
import { actorUserRef, getMockActor } from '../../../../shared/mocks/mock-actor.js';
import { chatMutationHandlers } from './chat-mutation-handlers.js';
import {
  applyReadReceipt,
  buildReplyPreview,
  hiddenConversations,
  nextMessageSeq,
  revealHiddenConversation,
  uploadedAttachments,
} from './chat-mock-state.js';

let chatTaskSeq = 60;

const conversationHandlers = [
  http.get('/api/v1/chat/conversations', () =>
    HttpResponse.json({
      items: demoConversations.filter((c) => !hiddenConversations.has(c.id)),
      nextCursor: null,
    }),
  ),

  /** Личный диалог с сотрудником (карточка сотрудника — чат всегда справа):
   * find-or-create по участнику (идемпотентно); диалог с собой — «заметки
   * для себя» (модель «Избранного» мессенджеров). */
  http.get('/api/v1/chat/conversations/direct/:userId', ({ params }) => {
    const userId = String(params.userId);
    const actorId = getMockActor().id;
    const existing = demoConversations.find(
      (c) =>
        c.type === 'direct' &&
        (userId === actorId
          ? c.membersPreview.length === 1 && c.membersPreview[0]?.id === actorId
          : c.membersPreview.some((m) => m.id === userId)),
    );
    if (existing) return HttpResponse.json(existing);
    const person = demoUserListItems.find((u) => u.id === userId);
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
      myRole: 'member',
      permissions: {
        changeInfo: 'admin',
        addMembers: 'member',
        removeMembers: 'admin',
        post: 'member',
        manageSettings: 'owner',
      },
      draft: null,
      visibility: null,
      description: null,
      project: null,
      task: null,
      letter: null,
      membersPreview: [userRef(person.id)],
      lastMessage: null,
      unreadCount: 0,
      pinned: false,
      muted: false,
      snoozed: false,
    };
    demoConversations.push(conversation);
    return HttpResponse.json(conversation, { status: 201 });
  }),

  /** Сообщения беседы; с threadRootId — тред канала: корень + ответы
   *  (ровно один уровень, корень первым). Просмотры (readAt/readBy) —
   *  watermark-модель #102 раунд 2: двигаются ТОЛЬКО квитанциями
   *  POST /read (applyReadReceipt), выдача ленты их не трогает. */
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

  /** Квитанция просмотров (#102 раунд 2): seq самой новой видимой строки
   *  вьюпорта; мок двигает просмотры СВОИХ сообщений до upToSeq (симуляция
   *  собеседника «просматривает видимое по мере прокрутки», минимально —
   *  по квитанции клиента). Идемпотентна: повтор — тот же результат. */
  http.post('/api/v1/chat/conversations/:id/read', async ({ params, request }) => {
    const parsed = readConversationBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const upToSeq = applyReadReceipt(String(params.id), parsed.data.upToSeq);
    if (upToSeq < 0)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    return HttpResponse.json({ upToSeq });
  }),

  /** Отправка сообщения (sendMessageBodySchema): в тред — с threadRootId,
   * счётчик ответов корня растёт (лента канала читает его без загрузки треда);
   * ответ-цитата — replyToId (+quoteText частичной цитаты), снапшот frozen;
   * вложения — attachmentIds загруженных через POST /chat/attachments (A1). */
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
    const attachments = (parsed.data.attachmentIds ?? [])
      .map((attachmentId) => uploadedAttachments.get(attachmentId))
      .filter((a): a is MessageAttachment => a !== undefined);
    for (const attachment of attachments) uploadedAttachments.delete(attachment.id);
    revealHiddenConversation(String(params.id)); // активность раскрывает беседу (#103)
    const seq = nextMessageSeq(String(params.id));
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: String(params.id),
      seq,
      author: actorUserRef(),
      text: parsed.data.text,
      replyToId: parsed.data.replyToId ?? null,
      reply: parsed.data.replyToId
        ? buildReplyPreview(parsed.data.replyToId, parsed.data.quoteText)
        : null,
      deletedAt: null,
      pinned: false,
      forwardedFrom: null,
      threadRootId,
      threadRepliesCount: 0,
      reactions: [],
      attachments,
      editedAt: null,
      readAt: null,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    demoMessages.push(message);
    if (threadRootId) {
      const root = demoMessages.find((m) => m.id === threadRootId);
      if (root) root.threadRepliesCount += 1;
    }
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (conversation && !threadRootId) conversation.lastMessage = message;
    // Новое сообщение снимает «Посмотреть позже»: счётчик снова виден.
    // Отправка ГАСИТ черновик (контракт #91, урок tdesktop#26236): сервер
    // делает это в транзакции отправки, а не клиент по клику «Отправить».
    if (conversation) {
      conversation.snoozed = false;
      conversation.draft = null;
    }
    return HttpResponse.json(message, { status: 201 });
  }),

  /** Черновик пользователя (контракт #91): клиент шлёт PUT с debounce 1000 мс
   *  после паузы набора + flush при переключении беседы и скрытии вкладки;
   *  пустой текст = очистка. revision растёт монотонно (last-write-wins). */
  http.put('/api/v1/chat/conversations/:id/draft', async ({ params, request }) => {
    const parsed = saveConversationDraftBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    conversation.draft = parsed.data.text
      ? {
          text: parsed.data.text,
          revision: (conversation.draft?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        }
      : null;
    return HttpResponse.json(conversation.draft);
  }),

  /** Создание группового чата/канала (#91, реф окна Bitrix24): владелец —
   *  первый участник, матрица прав — дефолты сервера, аватарка — цветная
   *  заглушка из инициалов до старта MinIO (#57, право загрузки changeInfo). */
  http.post('/api/v1/chat/conversations', async ({ request }) => {
    const parsed = createConversationBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const members = (parsed.data.memberIds ?? [])
      .filter((id) => demoUserListItems.some((u) => u.id === id))
      .map((id) => userRef(id));
    const conversation: ConversationListItem = {
      id: crypto.randomUUID(),
      type: parsed.data.type,
      title: parsed.data.title,
      avatarUrl: null,
      myRole: 'owner',
      permissions: {
        changeInfo: 'admin',
        addMembers: 'member',
        removeMembers: 'admin',
        post: 'member',
        manageSettings: 'owner',
      },
      draft: null,
      visibility: parsed.data.visibility ?? 'closed',
      description: parsed.data.description ?? null,
      project: null,
      task: null,
      letter: null,
      membersPreview: [actorUserRef(), ...members],
      lastMessage: null,
      unreadCount: 0,
      pinned: false,
      muted: false,
      snoozed: false,
    };
    demoConversations.unshift(conversation);
    return HttpResponse.json(conversation, { status: 201 });
  }),

  /** Контекстное меню беседы (ПКМ, реф Битрикс24, вердикт 14.09.2026):
   *  закрепить / звук / «посмотреть позже» / скрыть из списка. */
  http.patch('/api/v1/chat/conversations/:id', async ({ params, request }) => {
    const parsed = conversationUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const { hidden, ...flags } = parsed.data;
    Object.assign(conversation, flags);
    if (hidden !== undefined) {
      if (hidden) hiddenConversations.add(conversation.id);
      else hiddenConversations.delete(conversation.id);
    }
    return HttpResponse.json(conversation);
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
      creator: actorUserRef(),
      assignee: actorUserRef(),
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

/** Единый агрегат мок-хендлеров чата: беседы/лента/отправка + мутации
 *  сообщений линии A (chat-mutation-handlers.ts). Порядок важен: более
 *  специфичные маршруты (:id/pins, :id/forward) MSW матчит по шаблону,
 *  конфликтов с :id/messages нет. */
export const chatHandlers = [...conversationHandlers, ...chatMutationHandlers];
