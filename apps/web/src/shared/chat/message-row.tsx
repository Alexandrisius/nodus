import type { ReactNode } from 'react';
import { cn } from '@nodus/ui/lib/utils';

import { useFlashStore } from './jump-store.js';

/**
 * Строка сообщения ленты (#87): единая обёртка для всех хостов — якорь
 * data-message-id (DOM-прыжок лент без MessageScroller), подписка на вспышку
 * (jump-store → .message-flash, css-утилита globals), affordance мультивыбора.
 * Выделение — ТОЛЬКО ЦВЕТОМ (#151, вердикт владельца 29.09: анимация сдвига
 * пузырей и кружки-чекбоксы убраны — у пилотов лагал сам процесс выделения):
 * строка красится глобальным CSS по `[data-selected]` (globals.css, тинт
 * bubble-content/post-surface), никакого reflow-перехода каждого пузыря.
 * Клик по строке в режиме селекта перехватывается в CAPTURE-фазе: внутренние
 * интерактивы пузыря (лайтбокс, ссылки, реакции) не срабатывают — канон
 * tdesktop (клик по сообщению переключает отметку).
 */
export function MessageRow({
  messageId,
  selectable = false,
  selected = false,
  onToggle,
  children,
}: {
  messageId: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (shiftKey: boolean) => void;
  children: ReactNode;
}) {
  const flashing = useFlashStore((s) => s.messageId === messageId);

  return (
    <div
      data-message-id={messageId}
      data-selected={selectable ? selected : undefined}
      className={cn(
        'relative min-w-0 rounded-lg',
        flashing && 'message-flash',
        selectable && 'cursor-pointer select-none',
      )}
      onClickCapture={
        selectable
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle?.(event.shiftKey);
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
