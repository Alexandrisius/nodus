import type { ConversationListItem } from '@nodus/contracts';

import { JUMP_TTL_MS, type JumpTarget } from './jump-store.js';

export interface OpenAnchorDecision {
  /** true — авто-догон выключен, пока якорь не встал (UnreadAnchor снимает). */
  anchoring: boolean;
  /** Jump-цель открытия (клик «Переслано от»/цитаты): побеждает якорь
   *  непрочитанных — ленту ведёт ОДИН механизм. null — jump-запроса нет. */
  jump: Pick<JumpTarget, 'messageId' | 'nonce'> | null;
}

/**
 * Решение об якоре открытия ленты (раунд 4) — ЧИСТАЯ функция, принимается
 * ОДИН раз на маунт тела ленты и только ПО готовности списка бесед:
 * при холодном deep-link список ещё грузится, myLastReadSeq неизвестен —
 * прежнее «unreadCount на маунте» молча открывало ленту в конец, и авто-догон
 * прочитывал весь хвост (вердикт раунда 3: «отправили 100 — открываю в
 * конце»). Гейт готовности списка живёт в conversation-pane.
 *
 * Приоритеты: активный (TTL) jump-запрос ЭТОЙ беседы (лента, не тред)
 * ПОБЕЖДАЕТ — иначе якорь непрочитанных и исполнитель прыжка дёргают ленту
 * по очереди («чат дёргается, навигация с 3–4 попыток», вердикт раунда 3).
 * Без jump: unreadCount > 0 → якорь на первом seq > myLastReadSeq; иначе
 * обычное открытие (низ).
 */
export function decideOpenAnchor(
  conversationId: string,
  conversation: ConversationListItem | null,
  options: { jumpTarget: JumpTarget | null; now?: number },
): OpenAnchorDecision {
  const now = options.now ?? Date.now();
  const target = options.jumpTarget;
  const jumpWins =
    target !== null &&
    target.conversationId === conversationId &&
    target.threadRootId === null &&
    now - target.requestedAt <= JUMP_TTL_MS;
  if (jumpWins && target) {
    return { anchoring: true, jump: { messageId: target.messageId, nonce: target.nonce } };
  }
  return { anchoring: (conversation?.unreadCount ?? 0) > 0, jump: null };
}
