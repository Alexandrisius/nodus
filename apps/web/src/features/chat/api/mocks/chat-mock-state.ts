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

/**
 * Квитанция просмотров (#102 раунд 2): просмотр = видимость в вьюпорте.
 * Мок-модель: гасит unread беседы; собеседник «просматривает» то же видимое
 * (минимальная симуляция по квитанции клиента — живого пира в моках нет):
 * СВОИ сообщения с seq ≤ upToSeq получают readAt + первого не-автора в
 * readBy (модель первого прочитавшего); после правки (readAt сброшен)
 * повторный просмотр восстанавливает. Клиент делает отложенную инвалидацию
 * после квитанции (use-viewport-read) — галочки переключаются без polling.
 */
/** Следующий seq беседы (мок-эквивалент allocateSeqs: 1..n по порядку). */
export function nextMessageSeq(conversationId: string): number {
  return (
    Math.max(
      0,
      ...demoMessages.filter((m) => m.conversationId === conversationId).map((m) => m.seq),
    ) + 1
  );
}

export function applyReadReceipt(conversationId: string, upToSeq: number): number {
  const conversation = demoConversations.find((c) => c.id === conversationId);
  if (!conversation) return -1;
  conversation.unreadCount = 0;
  const now = new Date().toISOString();
  for (const m of demoMessages) {
    if (m.conversationId !== conversationId || m.deletedAt || m.seq > upToSeq) continue;
    const reader = conversation.membersPreview.find((u) => u.id !== m.author.id);
    if (!reader) continue; // «Заметки»: просмотров нет
    if (m.readAt === null) m.readAt = now;
    if (!m.readBy.some((u) => u.id === reader.id)) m.readBy = [...m.readBy, reader];
  }
  return upToSeq;
}

/** Наблюдатели трэдов (раунд 3): rootId → userId → watermark трэда. Мок-модель
 *  минимальна: реплай в трэд делает наблюдателем, @упоминание — тоже,
 *  кнопка «Следить» — toggle; квитанция из треда двигает watermark (точка). */
export const threadWatchers = new Map<string, Map<string, number>>();

/** Карта наблюдателей трэда (создаётся по необходимости). */
export function threadWatchersOf(threadRootId: string): Map<string, number> {
  let watchers = threadWatchers.get(threadRootId);
  if (!watchers) {
    watchers = new Map();
    threadWatchers.set(threadRootId, watchers);
  }
  return watchers;
}

export function watchThreadMock(threadRootId: string, userId: string): boolean {
  const watchers = threadWatchersOf(threadRootId);
  if (watchers.has(userId)) {
    watchers.delete(userId);
    return false;
  }
  watchers.set(userId, 0);
  return true;
}

/** Квитанция из треда: гасит «есть новые» (чужие ответы ≤ upToSeq прочитаны). */
export function applyThreadReadReceipt(
  threadRootId: string,
  userId: string,
  upToSeq: number,
): void {
  const watchers = threadWatchers.get(threadRootId);
  if (!watchers?.has(userId)) return;
  watchers.set(userId, Math.max(watchers.get(userId) ?? 0, upToSeq));
}

/** Состояния трэдов беседы для текущего пользователя (mock GET threads/state):
 *  строка на каждый трэд, где он наблюдатель. */
export function threadStatesMock(conversationId: string, userId: string) {
  const items: { threadRootId: string; watched: boolean; unreadCount: number }[] = [];
  for (const [threadRootId, watchers] of threadWatchers) {
    const watermark = watchers.get(userId);
    if (watermark === undefined) continue;
    const root = demoMessages.find(
      (m) => m.id === threadRootId && m.conversationId === conversationId,
    );
    if (!root) continue;
    const unreadCount = demoMessages.filter(
      (m) =>
        m.threadRootId === threadRootId &&
        !m.deletedAt &&
        m.author.id !== userId &&
        m.seq > watermark,
    ).length;
    items.push({ threadRootId, watched: true, unreadCount });
  }
  return items;
}

/** @упоминания мока (паритет серверу, раунд 3): токены @Имя против ФИО
 *  демо-справочника (точное совпадение имени/фамилии/ФИО). */
export function parseMentionIds(
  text: string,
  resolve: (token: string) => { id: string; displayName: string } | undefined,
  authorId: string,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/@([\p{L}\p{M}\p{N}._-]+)/gu)) {
    const token = match[1];
    if (!token) continue;
    const person = resolve(token);
    if (!person || person.id === authorId || seen.has(person.id)) continue;
    seen.add(person.id);
    ids.push(person.id);
  }
  return ids;
}
