import { Pin } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime } from '../lib/format.js';
import { ReadTicks } from './read-ticks.js';

/**
 * Мета сообщения — ОДНА композиция на весь мессенджер (#96, вердикт владельца
 * 24.09.2026): пин → «изменено» → время → галочки. Состав и порядок живут
 * ЗДЕСЬ, поэтому пузырь чата и карточка поста канала не разъезжаются (до #96
 * карточка поста рисовала только время — закреп и правка на постах терялись,
 * хотя данные контракта (`pinned`, `editedAt`) и мок-мутации их выставляют).
 *
 * Строка ПОД содержимым, не в строке текста (вердикт владельца 24.09.2026:
 * инлайн меты в конец текста — провал итерации 1): в пузыре это нижняя строка
 * справа (реакции — слева, см. chat-message.tsx), в посте — строка под текстом.
 * Кегль 10px (`text-badge`) и плотный leading 12px: мета читается как микро-
 * данные и не раздувает облако по высоте (вердикт 24.09.2026).
 *
 * Тон: чужой пузырь/пост — muted-foreground; свой (залитый primary) —
 * тон primary-foreground с прозрачностью. Галочки прочтения — ТОЛЬКО у своих
 * в чате (`ticks`): семантика прочтения постов каналов — отдельная тема (#96,
 * «не входит»).
 */
export function MessageMeta({
  message,
  mine = false,
  ticks = false,
  className,
}: {
  message: ChatMessage;
  /** Своё сообщение — тон времени на заливке primary. */
  mine?: boolean;
  /** Галочки отправлено/прочитано (только чат: у постов канала их нет). */
  ticks?: boolean;
  className?: string;
}) {
  return (
    <span
      data-slot="message-meta"
      className={cn(
        'flex shrink-0 items-center gap-1 text-badge',
        mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
        className,
      )}
    >
      {message.pinned ? (
        <Pin role="img" aria-label={ui.chat.menu.pin} className="size-3" strokeWidth={1.75} />
      ) : null}
      {message.editedAt ? <span>{ui.chat.edited}</span> : null}
      <time className="font-mono tabular-nums" dateTime={message.createdAt}>
        {formatTime(message.createdAt)}
      </time>
      {ticks ? <ReadTicks read={message.readAt !== null} /> : null}
    </span>
  );
}
