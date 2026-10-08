import { z } from 'zod';

/**
 * Протокол моста «веб-приложение ↔ десктоп-оболочка» (ADR-0019).
 * Направление «веб → оболочка» — команды `window.nodusDesktop.*` (Tauri IPC,
 * capability выдаётся ровно origin'у портала в рантайме). Направление
 * «оболочка → веб» — события `window.__nodusDesktopInvoke(type, payload)`
 * (eval из Rust). Оболочка не переносит токены и креды — только команды
 * дисплея и навигации. Rust-сторона зеркалит эти схемы вручную
 * (apps/desktop/src-tauri/src/bridge.rs — рассинхрон = баг).
 */

/** Запрос оболочке показать попап уведомления (стек право-низ, ADR-0019 п.4). */
export const popupPayloadSchema = z.object({
  /** Ключ дедупликации: id сообщения или уведомления журнала. */
  id: z.string().min(1).max(200),
  /** Беседа для «Открыть»/быстрого ответа (uuid). */
  conversationId: z.string().uuid(),
  /** Заголовок попапа: имя автора или название беседы. */
  title: z.string().min(1).max(200),
  /** Аватар автора (абсолютный URL портала); пусто — графитовая заглушка. */
  avatarUrl: z.string().max(2000).optional(),
  /** Превью текста сообщения/уведомления. */
  preview: z.string().max(500),
  /** Важное (ADR-0016): попап висит до реакции, мигание критичное. */
  urgent: z.boolean(),
  /** Разрешён ли быстрый ответ из попапа (только личные/групповые беседы). */
  canReply: z.boolean(),
});
export type PopupPayload = z.infer<typeof popupPayloadSchema>;

/** Информация об оболочке для веб-приложения (диагностика, поддержка). */
export const shellInfoSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  platform: z.string().min(1).max(30),
});
export type ShellInfo = z.infer<typeof shellInfoSchema>;

/** Событие «оболочка → веб»: ответ из попапа (текст уже подтверждён пользователем). */
export const popupReplyEventSchema = z.object({
  id: z.string().min(1).max(200),
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4000),
});
export type PopupReplyEvent = z.infer<typeof popupReplyEventSchema>;

/** Событие «оболочка → веб»: открыть беседу (deep link `nodus://chat/<id>` или кнопка попапа). */
export const openConversationEventSchema = z.object({
  conversationId: z.string().uuid(),
});
export type OpenConversationEvent = z.infer<typeof openConversationEventSchema>;

/** Каталог типов событий моста «оболочка → веб» (расширяется). */
export const DESKTOP_BRIDGE_EVENTS = {
  popupReply: 'popup-reply',
  openConversation: 'open-conversation',
} as const;
export type DesktopBridgeEventType =
  (typeof DESKTOP_BRIDGE_EVENTS)[keyof typeof DESKTOP_BRIDGE_EVENTS];
