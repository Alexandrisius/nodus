import { useEffect } from 'react';

import { joinConversation, leaveConversation } from './socket-client.js';

/**
 * Подписка на комнату активной беседы (#104): join при открытии, leave при
 * уходе/смене. Комната даёт мгновенные события беседы и typing; членство
 * проверяет gateway по Postgres.
 */
export function useConvRoom(conversationId: string | null | undefined): void {
  useEffect(() => {
    if (!conversationId || conversationId.length === 0) {
      return;
    }
    joinConversation(conversationId);
    return () => {
      leaveConversation(conversationId);
    };
  }, [conversationId]);
}
