import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../auth-store.js';
import { connectChatSocket, disconnectChatSocket } from './socket-client.js';

/**
 * Подключение WS чата к жизненному циклу сессии (#104): монтируется один раз
 * в шелле приложения; после логина — соединение, при выходе — разрыв.
 * Состояние сокета тихое (индикаторов нет), поллинг остаётся fallback.
 */
export function useChatSocket(): void {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      connectChatSocket(queryClient);
    } else {
      disconnectChatSocket();
    }
    return () => {
      // Размонтирование шелла = конец приложения; сокет живёт с сессией.
    };
  }, [authStatus, queryClient]);
}
