import { chatMessageSentPayloadSchema, ui } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/**
 * Браузерные уведомления чата (#124, минимум живости без полного контура
 * #100): opt-in Switch в настройках мессенджера; уведомление — по WS-событию
 * chat.message_sent, когда вкладка в фоне ИЛИ беседа не открыта, и автор не
 * я. Permission запрашивается ТОЛЬКО жестом пользователя (требование
 * браузеров): переключатель в настройках и есть жест.
 */

const PREF_KEY = 'nodus-chat-notifications-v1';

/** Беседа, открытая сейчас в мессенджере (хосты ставят через сеттер). */
let openConversationId: string | null = null;

export function setOpenConversation(conversationId: string | null): void {
  openConversationId = conversationId;
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

/** Гейт события: чужое сообщение в фоновой вкладке или в неоткрытой беседе. */
export function shouldNotify(authorId: string, conversationId: string): boolean {
  if (!notificationsEnabled()) return false;
  if (authorId === (useAuthStore.getState().user?.id ?? null)) return false;
  if (!document.hidden && openConversationId === conversationId) return false;
  return true;
}

export function notifyMessage(authorName: string, text: string): void {
  const body = text.trim() || ui.chat.notificationEmpty;
  new Notification(ui.chat.notificationTitle, {
    body: `${authorName}: ${body.slice(0, 140)}`,
    tag: 'nodus-chat',
  });
}

/** Точка входа WS-события (socket-client): уведомление по message_sent. */
export function notifySentMessage(payload: unknown): void {
  const parsed = chatMessageSentPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.message) return;
  const { conversationId, message } = parsed.data;
  if (!shouldNotify(message.author.id, conversationId)) return;
  notifyMessage(message.author.displayName, message.text);
}
