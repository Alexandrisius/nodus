import type { ChatMessage, MessageAttachment, MessagePin, ReplyPreview } from '@nodus/contracts';

import { demoConversations, demoMessages, demoPins } from '../../../../shared/mocks/data/chat.js';
import { actorUserRef } from '../../../../shared/mocks/mock-actor.js';

/**
 * Состояние мок-домена чата для мутаций линии A (#87): загруженные вложения,
 * закрепы, правило удаления со следом, снапшоты цитат. Чистые операции над
 * общими демо-массивами (один стор ленты — канон chat.ts).
 */

/** Загруженные, но ещё не привязанные к сообщению вложения
 *  (POST /chat/attachments → attachmentIds отправки). */
export const uploadedAttachments = new Map<string, MessageAttachment>();

/** Усечение сниппета цитаты (серверная сторона снапшота). */
export const REPLY_SNIPPET_MAX = 160;

/** Снапшот цитаты — ЗАМОРОЖЕННЫЙ на момент отправки (вердикт 24.09).
 *  Оригинал удалён (или исчез бесследно) → deleted: true, контент пуст:
 *  удаление сильнее заморозки (канон Telegram lng_deleted_message). */
export function buildReplyPreview(replyToId: string, quoteText?: string | null): ReplyPreview {
  const target = demoMessages.find((m) => m.id === replyToId);
  if (!target || target.deletedAt) {
    return {
      id: replyToId,
      author: target?.author ?? null,
      text: '',
      quoteText: null,
      attachmentKind: null,
      deleted: true,
    };
  }
  return {
    id: target.id,
    author: target.author,
    text: target.text.slice(0, REPLY_SNIPPET_MAX),
    quoteText: quoteText ? quoteText.slice(0, REPLY_SNIPPET_MAX) : null,
    attachmentKind: target.attachments[0]?.kind ?? null,
    deleted: false,
  };
}

/** Правило следа (#41, вердикт владельца): «хоть один прочитал → след».
 *  Прод-сервер решает по last_read_seq участников; мок — по readAt-симуляции
 *  (своё сообщение «прочитывается» через ~2 с после отправки). */
export function hasBeenRead(message: ChatMessage): boolean {
  return message.readAt !== null;
}

/** Цитаты, ссылающиеся на удалённый оригинал, → «Сообщение удалено». */
export function markRepliesDeleted(messageId: string): void {
  for (const m of demoMessages) {
    if (m.reply?.id === messageId && !m.reply.deleted) {
      m.reply = { ...m.reply, deleted: true };
    }
  }
}

export function unpinById(conversationId: string, messageId: string): boolean {
  const index = demoPins.findIndex(
    (p) => p.message.id === messageId && p.message.conversationId === conversationId,
  );
  const pin = index >= 0 ? demoPins[index] : undefined;
  if (!pin) return false;
  pin.message.pinned = false;
  demoPins.splice(index, 1);
  return true;
}

/** Удаление СО СЛЕДОМ: надгробие на месте сообщения (текст/вложения/реакции
 *  очищены, авто-анпин — канон: удаление закреплённого спускает пин). */
export function applyDeletion(message: ChatMessage): ChatMessage {
  message.deletedAt = new Date().toISOString();
  message.text = '';
  message.attachments = [];
  message.reactions = [];
  message.reply = null;
  unpinById(message.conversationId, message.id);
  markRepliesDeleted(message.id);
  return message;
}

/** Удаление БЕЗ СЛЕДА (никто не прочитал): сообщение исчезает из ленты. */
export function removeMessage(messageId: string): void {
  const index = demoMessages.findIndex((m) => m.id === messageId);
  if (index < 0) return;
  const [gone] = demoMessages.splice(index, 1);
  if (!gone) return;
  unpinById(gone.conversationId, gone.id);
  markRepliesDeleted(messageId);
}

/** lastMessage беседы после мутаций (лента-стор меняется inplace). */
export function refreshLastMessage(conversationId: string): void {
  const conversation = demoConversations.find((c) => c.id === conversationId);
  if (!conversation) return;
  const last = [...demoMessages]
    .reverse()
    .find((m) => m.conversationId === conversationId && m.threadRootId === null);
  conversation.lastMessage = last ?? null;
}

export function pinsOf(conversationId: string): MessagePin[] {
  return demoPins.filter((p) => p.message.conversationId === conversationId);
}

/** Закреп (идемпотентно: повторный pin вернёт существующий). Свежий закреп
 *  первым — пин-бар показывает pins[0] (канон Telegram). */
export function pinMessage(conversationId: string, messageId: string): MessagePin | null {
  const message = demoMessages.find(
    (m) => m.id === messageId && m.conversationId === conversationId && !m.deletedAt,
  );
  if (!message) return null;
  const existing = demoPins.find((p) => p.message.id === messageId);
  if (existing) return existing;
  const pin: MessagePin = {
    message,
    pinnedBy: actorUserRef(),
    pinnedAt: new Date().toISOString(),
  };
  demoPins.unshift(pin);
  message.pinned = true;
  return pin;
}

/** Скрытые из списка беседы (ПКМ «Скрыть»: история сохраняется, I15).
 *  Активность (отправка/пересылка) раскрывает беседу у всех скрывших —
 *  модель Битрикс24 (#103). */
export const hiddenConversations = new Set<string>();

export function revealHiddenConversation(conversationId: string): void {
  hiddenConversations.delete(conversationId);
}
