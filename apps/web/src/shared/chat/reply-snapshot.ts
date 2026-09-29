import type { ChatMessage, ReplyPreview, UserRef } from '@nodus/contracts';

/**
 * Клиентский снапшот цитаты (A2, #87): черновик ответа хранится ПЛОСКИМ
 * (персистится в localStorage — ссылки на ChatMessage не переживают reload),
 * при оптимистичной отправке собирается в ReplyPreview контракта; сервер
 * возвращает канонический снапшот (замороженный — вердикт 24.09).
 */

export const REPLY_SNIPPET_MAX = 160;

export interface ReplyDraft {
  messageId: string;
  author: UserRef;
  /** Сниппет текста оригинала (усечён); '' у чисто медийного сообщения. */
  snippet: string;
  /** Частичная цитата: выделенный автором фрагмент (Replies 2.0). */
  quoteText: string | null;
  attachmentKind: 'image' | 'file' | null;
  /** Оригинал живёт в треде канала — прыжок по цитате целится в окно треда. */
  inThread: string | null;
}

export function replyDraftFrom(message: ChatMessage, quoteText?: string | null): ReplyDraft {
  return {
    messageId: message.id,
    author: message.author,
    snippet: message.text.slice(0, REPLY_SNIPPET_MAX),
    quoteText: quoteText ? quoteText.slice(0, REPLY_SNIPPET_MAX) : null,
    attachmentKind: message.attachments[0]?.kind ?? null,
    inThread: message.threadRootId,
  };
}

export function toReplyPreview(draft: ReplyDraft): ReplyPreview {
  return {
    id: draft.messageId,
    author: draft.author,
    text: draft.snippet,
    quoteText: draft.quoteText,
    attachmentKind: draft.attachmentKind,
    deleted: false,
  };
}
