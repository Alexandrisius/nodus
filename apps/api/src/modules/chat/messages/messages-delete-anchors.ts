import { CHAT_EVENTS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { EventBus } from '../../../core/events/event-bus.js';
import type { MessageRow } from './messages.repository.js';
import type { MessagesRepository } from './messages.repository.js';

/**
 * Коллапс якорей удаления (#163, вынесено из сервиса — I5: порог 500 строк):
 * удаляемое сообщение ссылается на надгробие-якорь без живых ответов. Такой
 * якорь больше не нужен (след держится только цепочкой) — коллапс в
 * obliterated, своё событие. Условие атомарно в UPDATE
 * (obliterateTombstone), двойной коллапс невозможен.
 */
export async function collapseAnchors(
  userId: string,
  conversationId: string,
  deleted: MessageRow,
  repo: MessagesRepository,
  eventBus: EventBus,
  tx: TransactionClient,
): Promise<void> {
  const anchors = new Set(
    [deleted.replyToId, deleted.threadRootId].filter(
      (id): id is string => id !== null && id !== deleted.id,
    ),
  );
  for (const anchorId of anchors) {
    const collapsed = await repo.obliterateTombstone(conversationId, anchorId, tx);
    if (collapsed) {
      await eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_DELETED,
        { conversationId, messageId: anchorId, obliterated: true },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
    }
  }
}
