import type { QueryClient } from '@tanstack/react-query';
import { chatMessageSentPayloadSchema, stripMentionTokens, ui } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { withoutPatronymic } from '../lib/format.js';
import { chatKeys } from '../chat/api.js';
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
 * позже» и видимой открытой беседе (зеркало B6 журнала); важное (urgent)
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
    // Модель Telegram: попап — только когда портал не на виду (в трее/свернут
    // или окно без фокуса); пользователь смотрит в портал — тишина, непрочи-
    // танные несут бейдж рейки/заголовка.
    const engaged = !isPortalBackground() && document.hasFocus();
    if (engaged) return;
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
