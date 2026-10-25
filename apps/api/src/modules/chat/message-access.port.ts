import type { TransactionClient } from '../../core/database/transaction-runner.js';

/**
 * Read-порт доступа к сообщению (ADR-0012, #37): модуль задач проверяет,
 * что актор видит сообщение, из которого создаёт задачу («В задачу») или
 * которое закрепляет в результате, и берёт снимок для цепочки
 * происхождения — не трогая таблицы чата (I3/I6). null — сообщения нет,
 * оно удалено или актор не участник беседы (без различия — нет оракула).
 * #380: снимок несёт число вложений (файлы итога — вложения чата задачи),
 * батч-чтения принимают клиент транзакции вызывающего (gotcha realtime:
 * чтение мимо tx-клиента занимает второе соединение пула).
 */
export const CHAT_MESSAGE_ACCESS = Symbol('CHAT_MESSAGE_ACCESS');

export interface ChatMessageSnapshot {
  messageId: string;
  conversationId: string;
  conversationTitle: string | null;
  /** Начало текста (до 160 символов) для узла цепочки. */
  excerpt: string;
  /** Живых вложений-файлов/изображений (стикеры не считаются, #380). */
  attachmentCount: number;
}

export interface ChatMessageAccess {
  snapshot(messageId: string, userId: string): Promise<ChatMessageSnapshot | null>;
  /** Обсуждение задачи (#252): задача беседы `type='task'` и число живых
   *  сообщений ленты (денорм `commentsCount`); null — беседа не задачи. */
  taskDiscussion(conversationId: string): Promise<{ taskId: string; count: number } | null>;
  /** Живые сообщения беседы ЗАДАЧИ по id (#380): один SQL с проверкой
   *  членства — чужая беседа/не участник/удалённое молча выпадают. */
  taskMessages(
    taskId: string,
    messageIds: readonly string[],
    userId: string,
    tx?: TransactionClient,
  ): Promise<ChatMessageSnapshot[]>;
  /** Число живых вложений у сообщений (#380): факт задачи, а не зрителя —
   *  членство не проверяется (нужно движку для гейта `result_files`). */
  countAttachments(messageIds: readonly string[], tx?: TransactionClient): Promise<number>;
}
