import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useNotifications, useNotificationSummary } from '../api/notifications-api.js';
import { NotificationsFeed } from '../components/notifications-feed.js';
import { NotificationReader } from '../components/notification-reader.js';
import { useNotificationDetailStore } from '../model/detail-store.js';

/**
 * Экран «Главная» (#100, фидбек владельца 01.10): прежняя витрина компании —
 * слоты `top` (метрики) и `rail` (труд/переработки/дни рождения) из app-слоя,
 * центральная колонка — лента уведомлений (на месте новостной). Карточка
 * просмотра (срочное/без источника) открывается ПОВЕРХ колонки ленты:
 * метрики сверху и правая колонка остаются видимыми (не полноэкранная панель).
 * Блоки витрины не рендерятся без /home/summary — лента занимает всю ширину.
 */
export function HomeFeedPage({ top, rail }: { top?: ReactNode; rail?: ReactNode }) {
  const attention = useNotifications('attention');
  const background = useNotifications('background');
  const summary = useNotificationSummary();
  const readerOpen = useNotificationDetailStore((s) => s.notificationId !== null);

  const feedColumnRef = useRef<HTMLDivElement>(null);
  // Открытие карточки поверх ленты: страница доглаживается к верху (видны
  // метрики), колонка ленты фиксируется по высоте видимой области — карточка
  // занимает ровно место ленты, закрывая её собой; закрытие возвращает поток.
  useEffect(() => {
    const el = feedColumnRef.current;
    if (!readerOpen || el === null) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const pageTop = el.getBoundingClientRect().top + window.scrollY;
    el.style.height = `${Math.max(320, window.innerHeight - pageTop - 24)}px`;
    return () => {
      el.style.height = '';
    };
  }, [readerOpen]);

  const attentionItems = attention.data?.items ?? [];
  const degraded = attention.isError && attention.error != null;

  const feed = degraded ? (
    <div className="node-panel p-6 text-sm text-muted-foreground">
      {ui.notifications.feedUnavailable}
    </div>
  ) : (
    <NotificationsFeed
      attentionItems={attentionItems}
      backgroundItems={background.data?.items ?? []}
      backgroundTotal={summary.data?.background ?? 0}
      loading={attention.isLoading && !attention.data}
    />
  );

  const column = (
    <div ref={feedColumnRef} className="relative min-w-0">
      {feed}
      <NotificationReader />
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto" data-edge-scroll>
      <h1 className="sr-only">{ui.notifications.homeTitle}</h1>
      <div className="flex flex-col gap-6 p-6">
        {top}
        <div>
          <NodeLabel label={ui.notifications.feedTitle} className="px-1" />
          {rail ? (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_21.25rem] items-start gap-6">
              {column}
              <div className="flex flex-col gap-5">{rail}</div>
            </div>
          ) : (
            <div className="mt-4">{column}</div>
          )}
        </div>
      </div>
    </div>
  );
}
