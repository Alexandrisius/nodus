import type { QueryClient } from '@tanstack/react-query';
import { chatMessageSentPayloadSchema, stripMentionTokens, ui } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { desktopDismissPopups, isDesktopShell } from '../desktop/desktop-bridge.js';
import { withoutPatronymic } from '../lib/format.js';
import { threadNotifyAllowed } from './thread-notify-gate.js';

/**
 * Браузерные уведомления чата (#124, минимум живости без полного контура
 * #100): opt-in Switch в настройках мессенджера; уведомление — по WS-событию
 * chat.message_sent, когда вкладка в фоне ИЛИ беседа не открыта, и автор не
 * я. Permission запрашивается ТОЛЬКО жестом пользователя (требование
 * браузеров): переключатель в настройках и есть жест.
 */

const PREF_KEY = 'nodus-chat-notifications-v1';

/**
 * Реестр хостов открытой беседы (#300): одну беседу держат НЕСКОЛЬКО хостов
 * (лента канала + окно треда + карточка мессенджера). Раньше общий
 * module-level маркер затирался null при анмаунте любого хоста — закрытие
 * окна треда гасило признак «смотрю в беседу», и попапы прилетали в открытый
 * чат. Реестр живёт до последнего хоста; «текущая» — последний заявленный
 * (верхняя карточка/окно поверх страницы — то, на что смотрит пользователь).
 */
const openConversationHosts: { conversationId: string }[] = [];

/**
 * Заявить беседу открытой (хост ленты/треда/карточки); возвращает release —
 * вызвать на анмаунте. Открыл беседу — попапы оболочки этой беседы гаснут,
 * не висят устаревшими (модель Telegram unlinkHistory); вне оболочки тихо.
 */
export function acquireOpenConversation(conversationId: string): () => void {
  const host = { conversationId };
  openConversationHosts.push(host);
  if (isDesktopShell()) {
    void desktopDismissPopups(conversationId);
  }
  return () => {
    const i = openConversationHosts.indexOf(host);
    if (i !== -1) openConversationHosts.splice(i, 1);
  };
}

/** Открытая беседа (глушит её тосты и попапы; B6 — читает toast-стор). */
export function getOpenConversation(): string | null {
  return openConversationHosts.length > 0
    ? openConversationHosts[openConversationHosts.length - 1]!.conversationId
    : null;
}

/** Сброс реестра (только тесты): детерминированное «ничего не открыто». */
export function resetOpenConversationRegistry(): void {
  openConversationHosts.length = 0;
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationsEnabled(): boolean {
  return (
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    localStorage.getItem(PREF_KEY) === 'on'
  );
}

/** Возврат разрешения браузера выдаёт только жест пользователя (Switch). */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  localStorage.setItem(PREF_KEY, 'on');
  return true;
}

export function disableNotifications(): void {
  localStorage.removeItem(PREF_KEY);
}

/**
 * Гейт события: чужое сообщение в фоновой вкладке или в неоткрытой беседе.
 * В десктоп-оболочке выключены ВСЕГДА (вердикт владельца 08.10, модель
 * Telegram): уведомления — только попапы оболочки, WebView2 не должен
 * поднимать нативные тосты Windows (дубль). Opt-in остаётся для браузера.
 */
export function shouldNotify(authorId: string, conversationId: string): boolean {
  if (isDesktopShell()) return false;
  if (!notificationsEnabled()) return false;
  if (authorId === (useAuthStore.getState().user?.id ?? null)) return false;
  if (!document.hidden && getOpenConversation() === conversationId) return false;
  return true;
}

export function notifyMessage(authorName: string, text: string): void {
  const body = text.trim() || ui.chat.notificationEmpty;
  new Notification(ui.chat.notificationTitle, {
    body: `${authorName}: ${body.slice(0, 140)}`,
    tag: 'nodus-chat',
  });
}

/**
 * Точка входа WS-события (socket-client): уведомление по message_sent.
 * Ответы в трэдах — только наблюдателям/@упомянутым (канон раунда 3, #300);
 * гейт асинхронный, синхронный путь (корневые сообщения) не ждёт.
 */
export function notifySentMessage(payload: unknown, queryClient?: QueryClient): void {
  const parsed = chatMessageSentPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.message) return;
  const { conversationId, message, mentionedUserIds } = parsed.data;
  const show = () => {
    if (!shouldNotify(message.author.id, conversationId)) return;
    // Упоминания — отображаемым текстом (браузерное уведомление без разметки).
    notifyMessage(withoutPatronymic(message.author.displayName), stripMentionTokens(message.text));
  };
  if (message.threadRootId !== null && queryClient) {
    const meId = useAuthStore.getState().user?.id ?? null;
    void threadNotifyAllowed(queryClient, meId, conversationId, message.threadRootId, mentionedUserIds).then(
      (allowed) => {
        if (allowed) show();
      },
    );
    return;
  }
  show();
}
