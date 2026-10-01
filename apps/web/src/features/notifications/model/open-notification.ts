import type { MouseEvent } from 'react';
import type { Notification } from '@nodus/contracts';

import { router } from '../../../app/router.js';
import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import type { SourceRect } from '../../../app/shell/slider-panel.js';
import { useNotificationDetailStore } from './detail-store.js';

/**
 * Клик по уведомлению (фидбек владельца 01.10, паттерн Битрикс24): сразу
 * ОТКРЫТЬ источник — карточку сущности с выбранной беседой/задачей, где видно
 * оригинал изменения; чтение источника гасит уведомление (message_read на
 * сервере). Карточка просмотра — для срочных (лист ознакомления: текст +
 * «Ознакомлен») и записей без источника; она живёт на Главной поверх колонки
 * ленты, поэтому открытие из другого раздела сначала ведёт на Главную.
 */
export function useOpenNotification(): (item: Notification, sourceRect?: SourceRect) => void {
  const openCard = useOpenCard();
  return (item, sourceRect) => {
    const card = item.tier === 'urgent' ? null : sourceCardOf(item);
    if (card) {
      openCard(card, sourceRect);
      return;
    }
    openNotificationReader(item.id);
  };
}

/** Открыть карточку просмотра на Главной (из любого раздела — с переходом). */
export function openNotificationReader(id: string): void {
  if (router.state.location.pathname !== '/home') {
    void router.navigate({ to: '/home' });
  }
  useNotificationDetailStore.getState().open(id);
}

/** Карточка-источник уведомления; null — источника нет (карточка просмотра). */
export function sourceCardOf(
  item: Notification,
): { kind: 'messenger' | 'task' | 'letter'; id: string } | null {
  if (item.conversationId) return { kind: 'messenger', id: item.conversationId };
  if (item.sourceType === 'task') return { kind: 'task', id: item.sourceId };
  if (item.sourceType === 'letter') return { kind: 'letter', id: item.sourceId };
  return null;
}

/** Rect строки-источника для раскрытия карточки сущности из места клика. */
export function rowSourceRect(e: MouseEvent<HTMLElement>): SourceRect | undefined {
  const el = e.currentTarget.closest('article') ?? e.currentTarget;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
