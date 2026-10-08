import type { QueryClient } from '@tanstack/react-query';
import { chatMessageSentPayloadSchema, stripMentionTokens, ui } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { withoutPatronymic } from '../lib/format.js';
import { chatKeys } from '../chat/api.js';
import { getOpenConversation } from '../chat/notifications.js';
import {
  desktopFlashTaskbar,
  desktopShowPopup,
  isDesktopShell,
  isPortalBackground,
} from './desktop-bridge.js';

/**
 * Попапы десктоп-оболочки по WS-событию chat.message_sent (ADR-0019): правила
 * тишины — ЗДЕСЬ, в веб-приложении (оболочка — только исполнитель дисплея).
 * Свidi-сообщения не звенят; обычное молчит в заглушённых беседах, «Посмотреть
 * позже» и в ОТКРЫТОЙ беседе под фокусом (зеркало B6 журнала); важное (urgent)
 * пробивается верхним ярусом (#177). Опти-ин браузерных уведомлений (#124)
 * тут НЕ действует: оболочку ставят осознанно.
 */
export function notifyDesktopMessage(payload: unknown, queryClient: QueryClient): void {
  if (!isDesktopShell()) return;
  const parsed = chatMessageSentPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.message) return;
  const { conversationId, urgent, message } = parsed.data;
  const authorId = message.author.id;
  if (authorId === (useAuthStore.getState().user?.id ?? null)) return;

  if (!urgent) {
    const flags = conversationFlags(queryClient, conversationId);
    if (flags?.muted || flags?.snoozed) return;
    // Модель Telegram (фидбек 08.10): тишина только когда пользователь СМОТРИТ
    // в эту беседу — окно на виду, в фокусе, беседа открыта. Фокус на другой
    // странице портала — попап нужен: сообщение всё равно не видно. Попапы
    // копятся до реакции (очередь в оболочке), бейдж считает непрочитанное.
    const looking =
      !isPortalBackground() && document.hasFocus() && getOpenConversation() === conversationId;
    if (looking) return;
  }

  void desktopShowPopup({
    id: message.id,
    conversationId,
    title: withoutPatronymic(message.author.displayName),
    avatarUrl: message.author.avatarUrl ?? undefined,
    preview: stripMentionTokens(message.text).slice(0, 200) || ui.chat.notificationEmpty,
    urgent,
    canReply: true,
  });
  void desktopFlashTaskbar(urgent);
}

/** Mute/snooze беседы из кэша списка (WS-инвалидация несёт свежесть). */
function conversationFlags(
  queryClient: QueryClient,
  conversationId: string,
): { muted: boolean; snoozed: boolean } | null {
  const cache = queryClient.getQueryData<{
    items?: { id: string; muted: boolean; snoozed: boolean }[];
  }>(chatKeys.conversations());
  return cache?.items?.find((c) => c.id === conversationId) ?? null;
}
