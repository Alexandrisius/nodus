import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useFlashStore } from './jump-store.js';

/**
 * Строка сообщения ленты (#87): единая обёртка для всех хостов — якорь
 * data-message-id (DOM-прыжок лент без MessageScroller), подписка на вспышку
 * (jump-store → .message-flash, css-утилита globals), affordance мультивыбора
 * (A6): колонка чекбокса слева, клик по строке — toggle (Shift — диапазон).
 * В режиме селекта клик перехватывается в CAPTURE-фазе: внутренние
 * интерактивы пузыря (лайтбокс, ссылки, реакции) не срабатывают — канон
 * tdesktop (клик по сообщению переключает отметку). Чекбокс — отдельная
 * hit-зона с preventDefault на mousedown (главный gotcha research: конфликт
 * с выделением текста).
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
      {/* Колонка чекбокса — ВСЕГДА в DOM (#124): вход/выход режима селекта
          анимируется (padding ленты + opacity/scale чекбокса, 220 мс — в такт
          морфу островка композера), вместо мгновенного сдвига всей ленты.
          Вне режима: pointer-events-none + aria-hidden — клики и AT не трогает
          (перехват клика строки и так только при selectable). */}
      <span
        aria-hidden={selectable ? undefined : true}
        className={cn(
          'absolute top-1/2 left-0 z-10 flex w-6 -translate-y-1/2 items-center justify-center pl-1 transition-[opacity,scale] duration-[220ms] ease-out',
          selectable ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-75',
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? ui.chat.deselectOne : ui.chat.selectOne}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            'flex size-5 items-center justify-center rounded-full border transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-card text-transparent hover:border-foreground/40',
          )}
        >
          <Check className="size-3" strokeWidth={2.5} />
        </button>
      </span>
      <div
        className={cn(
          'transition-[padding-left] duration-[220ms] ease-out',
          selectable ? 'pl-7' : 'pl-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
