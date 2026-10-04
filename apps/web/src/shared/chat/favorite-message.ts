import type { ChatMessage, FavoriteCard } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/**
 * Карточка избранного → псевдо-ChatMessage (ревизия #171 04.10): витрина
 * «Избранного» рендерит закладки КЛАССИЧЕСКИМИ пузырями — единый конвейер
 * buildMessageRuns/MessageRunView/ChatMessageItem. Карточка — живая ссылка
 * на оригинал: контент/автор/время оригинала, надгробие — штатное (#163).
 * Служебные поля нейтральны (seq 0, без пина/ответа) — поток сортируется
 * mergeNotesFlow по favoritedAt до группировки.
 */
export function toFavoriteMessage(card: FavoriteCard): ChatMessage {
  return {
    id: card.messageId,
    conversationId: card.conversationId,
    seq: 0,
    author: card.author,
    text: card.text,
    replyToId: null,
    reply: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: card.attachments,
    editedAt: card.editedAt,
    deletedAt: card.deletedAt,
    pinned: false,
    forwardedFrom: null,
    readAt: null,
    readBy: [],
    urgent: false,
    mentionedUserIds: [],
    createdAt: card.createdAt,
  };
}

/** Подпись чата-источника карточки («из …»): группы/каналы — название,
 *  direct — имя собеседника, task/letter — типовые подписи (I15, i18n). */
export function favoriteSourceTitle(card: FavoriteCard): string | null {
  if (card.conversationTitle) return card.conversationTitle;
  if (card.conversationType === 'task') return ui.chat.taskChat;
  if (card.conversationType === 'letter') return ui.chat.letterChat;
  return null;
}
