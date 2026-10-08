import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { api } from '../api-client.js';
import { enqueueSend } from '../chat/send-queue.js';
import { bindDesktopShellEvents, isDesktopShell } from './desktop-bridge.js';

/**
 * Хост моста оболочки (монтируется в app-shell рядом с useUnreadTitle):
 * слушает события «оболочка → веб» и сигналит готовность (shellReady —
 * оболочка доставляет отложенный deep link только после него).
 */
export function useDesktopBridge(): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const openConversation = useCallback(
    (conversationId: string) => {
      void navigate({ to: '/chat/$conversationId', params: { conversationId } });
    },
    [navigate],
  );

  useEffect(() => {
    if (!isDesktopShell()) return;
    return bindDesktopShellEvents({
      // Быстрый ответ из попапа: прямая отправка через очередь беседы
      // (серриализация #243, идемпотентность #48); сбой — открыть беседу,
      // чтобы пользователь повторил в композере.
      onPopupReply: ({ conversationId, text }) => {
        const tempId = crypto.randomUUID();
        enqueueSend(conversationId, () =>
          api(`/chat/conversations/${conversationId}/messages`, {
            method: 'POST',
            idempotencyKey: tempId,
            body: {
              text,
              attachmentIds: null,
              stickerId: null,
              replyToId: null,
              quoteText: null,
              threadRootId: null,
              urgent: false,
            },
          }),
        )
          .then(() => undefined)
          .catch(() => openConversation(conversationId));
      },
      // «Открыть» из попапа и deep link nodus://chat/<id>.
      onOpenConversation: ({ conversationId }) => openConversation(conversationId),
    });
  }, [queryClient, openConversation]);
}
