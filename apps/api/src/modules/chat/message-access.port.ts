/**
 * Read-порт доступа к сообщению (ADR-0012, #37): модуль задач проверяет,
 * что актор видит сообщение, из которого создаёт задачу («В задачу») или
 * которое закрепляет в результате, и берёт снимок для цепочки
 * происхождения — не трогая таблицы чата (I3/I6). null — сообщения нет,
 * оно удалено или актор не участник беседы (без различия — нет оракула).
 */
export const CHAT_MESSAGE_ACCESS = Symbol('CHAT_MESSAGE_ACCESS');

export interface ChatMessageSnapshot {
  messageId: string;
  conversationId: string;
  conversationTitle: string | null;
  /** Начало текста (до 160 символов) для узла цепочки. */
  excerpt: string;
}

export interface ChatMessageAccess {
  snapshot(messageId: string, userId: string): Promise<ChatMessageSnapshot | null>;
}
