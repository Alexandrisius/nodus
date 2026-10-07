import { ArrowDownIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { ui } from '@nodus/contracts';
import { MessageScrollerButton } from '@nodus/ui/components/message-scroller';

import { scrollMessageIntoView } from './scroll-jump.js';

/**
 * Стрелка «вниз» ленты беседы (раунд 4, вердикты владельца): пока первое
 * непрочитанное НИЖЕ сгиба — ПЛАВНАЯ (smooth, «красивая прокрутка», не
 * телепорт) прокрутка к нему; первое непрочитанное уже видно (дочитали до
 * него или непрочитанных нет) — штатное поведение примитива: плавный скролл
 * в самый низ. «Навигации по одному сообщению вниз» НЕТ (вердикт
 * раунда 4): один клик — одно плавное движение к первой непрочитанной
 * границе, следующий — в конец ленты.
 *
 * #132: чип-счётчик НЕпрочитанных на кнопке (модель Telegram): новые
 * сообщения копятся, пока читатель в истории; цифра гаснет с прочтением.
 * Канон счётчиков — моно 11px tabular-nums.
 * #236 (вердикт 07.10): заливка — ЦВЕТ СВОЕГО ПУЗЫРЯ (bubble-out), текст —
 * foreground пузыря: в тёмной теме синий+белый как в Telegram, в светлой —
 * читаемая пара своего пузыря (тон всей меты на пузыре, #127). Размер —
 * literal px (13px), не rem-классы: при ui-scale 1.25 бейдж раздувало
 * (h-4 = 20px фактических). Центр цифры — leading = высоте (канон бейджа
 * аватарки экспресс-полосы).
 *
 * preventDefault выключает встроенный scrollToEnd кнопки примитива только
 * в ветке «к первому непрочитанному».
 */
export function FeedScrollerButton({
  firstUnreadId,
  viewportRef,
  unreadCount = 0,
}: {
  firstUnreadId: string | null;
  viewportRef: RefObject<HTMLElement | null>;
  unreadCount?: number;
}) {
  const content = (
    <>
      <ArrowDownIcon />
      <span className="sr-only">{ui.chat.scrollToUnread}</span>
      {unreadCount > 0 ? (
        <span
          data-slot="feed-unread-badge"
          className="absolute -top-1.5 -right-1.5 min-w-[13px] rounded-full bg-bubble-out px-[3px] text-center font-mono text-[10px] leading-[13px] font-medium text-bubble-out-foreground tabular-nums"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </>
  );
  if (firstUnreadId === null) {
    return <MessageScrollerButton>{content}</MessageScrollerButton>;
  }
  return (
    <MessageScrollerButton
      onClick={(event) => {
        const viewport = viewportRef.current;
        const el = viewport?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(firstUnreadId)}"]`,
        );
        const vr = viewport?.getBoundingClientRect();
        const er = el?.getBoundingClientRect();
        // Первое непрочитанное уже ПОЛНОСТЬЮ видно — граница достигнута:
        // штатный плавный скролл в конец ленты.
        const alreadyAtUnread =
          el && vr && er && er.top >= vr.top - 1 && er.bottom <= vr.bottom + 1;
        if (alreadyAtUnread || !el || !viewport) return; // без preventDefault
        event.preventDefault();
        scrollMessageIntoView(el, viewport, {
          align: 'start',
          margin: 48,
          behavior: 'smooth',
        });
      }}
    >
      {content}
    </MessageScrollerButton>
  );
}
