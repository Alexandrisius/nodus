import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import {
  batchDeleteMessagesBodySchema,
  editMessageBodySchema,
  ErrorCode,
  forwardMessagesBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations, demoMessages } from '../../../../shared/mocks/data/chat.js';
import { actorUserRef, getMockActor } from '../../../../shared/mocks/mock-actor.js';
import {
  applyDeletion,
  hasBeenRead,
  pinMessage,
  pinsOf,
  refreshLastMessage,
  removeMessage,
  unpinById,
  uploadedAttachments,
} from './chat-mock-state.js';

/**
 * Мутации сообщений линии A (#87): загрузка вложений, правка, удаление
 * (без следа / со следом — правило решает «сервер»), закрепы, пересылка.
 * Ответы — строго контракты chat.schemas (мок ≠ контракту = баг).
 */

function notFound(message = 'Message not found') {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

function validationFailed() {
  return HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );
}

function forbidden(message = 'Only author can modify this message') {
  return HttpResponse.json({ code: ErrorCode.FORBIDDEN, message }, { status: 403 });
}

function findMessage(conversationId: unknown, messageId: unknown): ChatMessage | undefined {
  return demoMessages.find(
    (m) => m.id === String(messageId) && m.conversationId === String(conversationId),
  );
}

export const chatMutationHandlers = [
  /** Загрузка вложения (multipart): сообщение хранит attachmentIds
   *  (задел POST /chat/attachments из плана бэкенда, трек 5). MOCK-СОГЛАШЕНИЕ:
   *  клиент передаёт previewUrl (objectURL) и габариты изображения — blob-URL,
   *  созданный в service worker, в странице не резолвится; в проде url/превью
   *  даёт MinIO через StorageDriver (I13), поля-подсказки игнорируются. */
  http.post('/api/v1/chat/attachments', async ({ request }) => {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return validationFailed();
    const previewUrl = form.get('previewUrl');
    const width = Number(form.get('width'));
    const height = Number(form.get('height'));
    const isImage = file.type.startsWith('image/');
    const attachment: MessageAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      kind: isImage ? 'image' : 'file',
      url: typeof previewUrl === 'string' && previewUrl ? previewUrl : null,
      thumbnailUrl: isImage && typeof previewUrl === 'string' ? previewUrl : null,
      width: isImage && Number.isFinite(width) && width > 0 ? Math.round(width) : null,
      height: isImage && Number.isFinite(height) && height > 0 ? Math.round(height) : null,
    };
    uploadedAttachments.set(attachment.id, attachment);
    return HttpResponse.json(attachment, { status: 201 });
  }),

  /** Правка (A4): editedAt ставится только при реальной смене текста;
   *  readAt сбрасывается — «повторный пуш прочитавшим» (решение #41).
   *  Закрепы держат ссылку на объект — пин-бар обновляется реактивно. */
  http.patch('/api/v1/chat/conversations/:id/messages/:messageId', async ({ params, request }) => {
    const parsed = editMessageBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const message = findMessage(params.id, params.messageId);
    if (!message || message.deletedAt) return notFound();
    if (message.author.id !== getMockActor().id) return forbidden();
    // Паритет с бэком (#111): пересланную копию не правит даже переславший.
    if (message.forwardedFrom) return forbidden('Forwarded messages cannot be edited');
    if (message.text !== parsed.data.text) {
      message.text = parsed.data.text;
      message.editedAt = new Date().toISOString();
      message.readAt = null;
    }
    return HttpResponse.json(message);
  }),

  /** Удаление (A5): не прочитали → 204 без следа; прочитали → 200 + надгробие. */
  http.delete('/api/v1/chat/conversations/:id/messages/:messageId', ({ params }) => {
    const message = findMessage(params.id, params.messageId);
    if (!message || message.deletedAt) return notFound();
    if (message.author.id !== getMockActor().id) return forbidden();
    const conversationId = String(params.id);
    if (hasBeenRead(message)) {
      applyDeletion(message);
      refreshLastMessage(conversationId);
      return HttpResponse.json(message);
    }
    removeMessage(message.id);
    refreshLastMessage(conversationId);
    return new HttpResponse(null, { status: 204 });
  }),

  /** Пакетное удаление (A6): лимит 100 — схемой; чужие/уже удалённые —
   *  пропускаются (канон tdesktop: действие доступно только когда применимо
   *  ко всем — клиент кнопку не показывает, сервер страховкой). */
  http.post('/api/v1/chat/conversations/:id/messages/batch-delete', async ({ params, request }) => {
    const parsed = batchDeleteMessagesBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const removed: string[] = [];
    const tombstones: ChatMessage[] = [];
    for (const id of parsed.data.messageIds) {
      const message = findMessage(params.id, id);
      if (!message || message.deletedAt) continue;
      if (message.author.id !== getMockActor().id) continue;
      if (hasBeenRead(message)) {
        tombstones.push(applyDeletion(message));
      } else {
        removeMessage(id);
        removed.push(id);
      }
    }
    refreshLastMessage(String(params.id));
    return HttpResponse.json({ removed, tombstones });
  }),

  /** Закрепы (A3): список — снапшотами (закреп может быть вне окна ленты). */
  http.get('/api/v1/chat/conversations/:id/pins', ({ params }) =>
    HttpResponse.json({ items: pinsOf(String(params.id)), nextCursor: null }),
  ),

  http.post('/api/v1/chat/conversations/:id/messages/:messageId/pin', ({ params }) => {
    const pin = pinMessage(String(params.id), String(params.messageId));
    if (!pin) return notFound();
    return HttpResponse.json(pin, { status: 201 });
  }),

  http.delete('/api/v1/chat/conversations/:id/messages/:messageId/pin', ({ params }) => {
    if (!unpinById(String(params.id), String(params.messageId))) return notFound();
    return new HttpResponse(null, { status: 204 });
  }),

  /** Пересылка (A7): серверные копии в целевую беседу (вложения — по ссылке,
   *  не перекачиваются); комментарий — отдельным сообщением ПЕРЕД блоком
   *  (канон Telegram ShareBox); threadRootId — цель внутри треда канала.
   *  Reply-контекст оригинала теряется (классика Telegram). */
  http.post('/api/v1/chat/conversations/:id/forward', async ({ params, request }) => {
    const parsed = forwardMessagesBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const target = demoConversations.find((c) => c.id === String(params.id));
    if (!target) return notFound('Conversation not found');
    const threadRootId = parsed.data.threadRootId ?? null;
    const root = threadRootId
      ? demoMessages.find((m) => m.id === threadRootId && m.conversationId === target.id)
      : undefined;
    if (threadRootId && !root) return notFound('Thread root not found');

    const created: ChatMessage[] = [];
    const stamp = (offset: number) => new Date(Date.now() + offset).toISOString();
    if (parsed.data.comment) {
      const comment: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: target.id,
        author: actorUserRef(),
        text: parsed.data.comment,
        replyToId: null,
        reply: null,
        threadRootId,
        threadRepliesCount: 0,
        reactions: [],
        attachments: [],
        editedAt: null,
        deletedAt: null,
        pinned: false,
        forwardedFrom: null,
        readAt: null,
        createdAt: stamp(0),
      };
      created.push(comment);
    }
    parsed.data.messageIds.forEach((id, index) => {
      const source = demoMessages.find(
        (m) => m.id === id && m.conversationId === parsed.data.sourceConversationId,
      );
      if (!source || source.deletedAt) return;
      const copy: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: target.id,
        author: actorUserRef(),
        text: source.text,
        replyToId: null,
        reply: null,
        threadRootId,
        threadRepliesCount: 0,
        reactions: [],
        attachments: source.attachments,
        editedAt: null,
        deletedAt: null,
        pinned: false,
        forwardedFrom: {
          author: source.author,
          conversationId: source.conversationId,
          messageId: source.id,
          threadRootId: source.threadRootId,
        },
        readAt: null,
        createdAt: stamp(index + 1),
      };
      created.push(copy);
      if (root) root.threadRepliesCount += 1;
    });
    if (created.length === 0) return notFound('No messages to forward');
    demoMessages.push(...created);
    const lastCreated = created[created.length - 1];
    if (!threadRootId && lastCreated) target.lastMessage = lastCreated;
    target.snoozed = false;
    return HttpResponse.json(created, { status: 201 });
  }),
];
