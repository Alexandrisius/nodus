import { Forward, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { plural } from '../lib/format.js';
import type { ForwardPending } from './forward-pending.js';

/**
 * Бар пересылки над полем ввода (A7, переделка по вердикту 24.09: модель
 * Bitrix24 — получатель выбран в пикере, комментарий пишется ЗДЕСЬ: текст
 * поля уйдёт вместе с блоком на отправке, Enter/кнопка работают как обычно).
 * Крестик и Esc отменяют пересылку, текст остаётся обычным черновиком.
 * Визуальный язык бара ответа/правки (ступень тона, акцентная линия слева,
 * без разделителей — канон 24.09).
 */
export function ForwardBanner({
  pending,
  onCancel,
}: {
  pending: ForwardPending;
  onCancel: () => void;
}) {
  const count = pending.messageIds.length;
  return (
    <span className="flex items-stretch gap-1.5 rounded-lg bg-accent/40 py-1.5 pr-1.5 pl-2.5">
      <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-info" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-info">
          <Forward className="size-3" strokeWidth={1.75} />
          {ui.chat.forwardTitle}: {count}{' '}
          {plural(count, [ui.chat.messageOne, ui.chat.messageFew, ui.chat.messageMany])}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {ui.chat.forwardFrom}: {pending.fromLabel}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 self-center text-muted-foreground"
        onClick={onCancel}
        aria-label={ui.common.cancel}
      >
        <X />
      </Button>
    </span>
  );
}
