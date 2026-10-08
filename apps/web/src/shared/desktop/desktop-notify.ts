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

  // Превью: текст сообщения; без текста — метка вложения («Фотография»),
  // попап красит её акцентом (модель Telegram, фидбек 08.10).
  const attachments = message.attachments ?? [];
  const text = stripMentionTokens(message.text).trim();
  let preview: string;
  let previewAttachment = false;
  if (text) {
    preview = text.slice(0, 200);
  } else if (attachments.length > 0) {
    preview = attachmentLabel(attachments, ui.desktop);
    previewAttachment = true;
  } else {
    preview = ui.chat.notificationEmpty;
  }

  void desktopShowPopup({
    id: message.id,
    conversationId,
    title: withoutPatronymic(message.author.displayName),
    avatarUrl: message.author.avatarUrl ?? undefined,
    preview,
    previewAttachment,
    urgent,
    canReply: true,
  });
  void desktopFlashTaskbar(urgent);
}

/** Метка вложения для превью попапа: вид носителя + число (как Telegram). */
function attachmentLabel(
  attachments: { kind: string; previewKind?: string; mime: string }[],
  t: typeof ui.desktop,
): string {
  const first = attachments[0];
  if (!first) return t.attachmentFile;
  const mime = first.mime.toLowerCase();
  const label =
    first.kind === 'sticker'
      ? t.attachmentSticker
      : first.previewKind === 'image'
        ? attachments.length > 1
          ? t.attachmentImages
          : t.attachmentImage
        : first.previewKind === 'video'
          ? t.attachmentVideo
          : first.previewKind === 'pdf'
            ? t.attachmentPdf
            : first.previewKind === 'office'
              ? t.attachmentOffice
              : mime.startsWith('audio/')
                ? t.attachmentAudio
                : t.attachmentFile;
  return attachments.length > 1 ? `${label} ×${attachments.length}` : label;
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
