import { useEffect, useRef, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@nodus/contracts';

import { api } from '../api-client.js';
import { isDomainMocked } from '../api/api-mock-config.js';
import { wsDebugLog } from '../socket/ws-debug.js';
import { chatKeys } from './api.js';
import {
  createReadReceiptScheduler,
  type ReadReceiptScheduler,
} from './viewport-read-scheduler.js';

/**
 * Квитанции просмотров (#102 раунд 2): просмотр = видимость в вьюпорте.
 * ЕДИНЫЙ механизм для всех трёх лент — собственный IntersectionObserver с
 * root=скроллер по строкам `[data-message-id]` (паттерн use-infinite-sentinel).
 * Готовый visibility-стор примитива MessageScroller НЕ годится: его снапшот
 * собирается только по ПРЯМЫМ детям контента (content.children), а наши
 * MessageScrollerItem вложены в обёртки серий message-groups — список видимых
 * всегда пуст (воспроизведено на живом стеке 25.09). Квитанция двигает
 * watermark БЕСЕДЫ: увидел где угодно (лента или тред) = просмотрено.
 */

type SeqSource = Pick<ChatMessage, 'id' | 'seq'>;

function useReadReceiptScheduler(conversationId: string): RefObject<ReadReceiptScheduler | null> {
  const queryClient = useQueryClient();
  const schedulerRef = useRef<ReadReceiptScheduler | null>(null);

  useEffect(() => {
    const scheduler = createReadReceiptScheduler({
      send: (upToSeq) => {
        void api(`/chat/conversations/${conversationId}/read`, {
          method: 'POST',
          body: { upToSeq },
        })
          .then(() => {
            // Бейдж непрочитанных гаснет сразу и без WS (событие придёт —
            // инвалидация идемпотентна).
            void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
            if (isDomainMocked('chat')) {
              // МОК-симуляция собеседника (аудит #45): в моках нет WS/поллинга —
              // «просматривает» то же видимое чуть позже, отложенный рефеч
              // переключает галочки (бывший таймер отправки, #102 р.2).
              window.setTimeout(() => {
                void queryClient.invalidateQueries({
                  queryKey: chatKeys.messages(conversationId),
                });
              }, 2500);
            }
          })
          .catch(() => undefined); // квитанция — фоновая; догонит следующая
      },
    });
    schedulerRef.current = scheduler;

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        scheduler.flush(); // уход из таба — зафиксировать увиденное
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      scheduler.flush(); // смена беседы: хвост ниже вьюпорта не прочитан
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [conversationId, queryClient]);

  return schedulerRef;
}

/**
 * Наблюдение видимости строк ленты: IO с root=скроллер по элементам строк
 * (`data-message-id`); max seq видимых кормит планировщик квитанций.
 * Перерисовок НЕТ — чистый императив в эффекте; при смене данных (рефетч)
 * наблюдение перевешивается (IO заново даёт начальные пересечения).
 */
export function useFeedViewportRead(
  conversationId: string,
  containerRef: RefObject<HTMLElement | null>,
  rows: readonly SeqSource[],
): void {
  const schedulerRef = useReadReceiptScheduler(conversationId);

  useEffect(() => {
    const container = containerRef.current;
    const scheduler = schedulerRef.current;
    if (!container || !scheduler || typeof IntersectionObserver === 'undefined') return;
    const elSeq = new Map<Element, number>();
    const visibleEls = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleEls.add(entry.target);
          else visibleEls.delete(entry.target);
        }
        let max: number | null = null;
        for (const el of visibleEls) {
          const seq = elSeq.get(el);
          if (seq !== undefined && (max === null || seq > max)) max = seq;
        }
        wsDebugLog('viewport-read observe:', conversationId, 'maxSeq:', max);
        scheduler.observe(max);
      },
      { root: container, threshold: 0 },
    );
    for (const row of rows) {
      const el = container.querySelector(`[data-message-id="${CSS.escape(row.id)}"]`);
      if (el) {
        elSeq.set(el, row.seq);
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, [conversationId, rows, containerRef, schedulerRef]);
}
