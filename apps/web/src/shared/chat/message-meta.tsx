import { Pin, Star } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useUrgentAcks } from '../notifications-acks.js';
import { formatTime } from '../lib/format.js';
import { useFavoriteIds, useNotesConversationId } from './favorites-api.js';
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
 * Тон — по ПОВЕРХНОСТИ, не по авторству (#127): на залитом своём пузыре —
 * акцент пузыря (зелёный/светло-синий, канон Telegram: время и галочки в тон
 * заливке); на чужом пузыре и на карточке поста (node-panel) — muted-foreground
 * (до #127 тон шёл от mine: мета СВОИХ постов канала красилась
 * primary-foreground и в тёмной теме исчезала чёрным по чёрному). Галочки
 * прочтения — ТОЛЬКО у своих: «просмотрено» = сообщение просмотрел ХОТЯ БЫ
 * ОДИН участник (readBy, модель Битрикс24/Telegram, #102; у постов канала —
 * тоже, критерий «Новости»).
 */
export function MessageMeta({
  message,
  onFilled = false,
  ticks = false,
  plain = false,
  className,
}: {
  message: ChatMessage;
  /** Мета на залитом своём пузыре — акцент пузыря вместо muted-foreground. */
  onFilled?: boolean;
  /** Галочки отправлено/просмотрено (у своих сообщений и постов каналов). */
  ticks?: boolean;
  /** Без семантики (aria/role): копия-призрак для резерва ширины (#187) —
   *  иначе e2e getByLabel('просмотрено') находит СКРЫТУЮ копию первой и
   *  toBeVisible падает на visibility:hidden. */
  plain?: boolean;
  className?: string;
}) {
  // Звезда личной закладки (#171): только на СВОИХ избранных сообщениях и
  // НЕ внутри «Заметков» (self-reference там запрещён).
  const favoriteIds = useFavoriteIds();
  const notesId = useNotesConversationId();
  const favorited = favoriteIds.has(message.id) && message.conversationId !== notesId;
  return (
    <span
      data-slot="message-meta"
      className={cn(
        'flex shrink-0 items-center gap-1 text-badge',
        onFilled ? 'text-bubble-out-accent' : 'text-muted-foreground',
        className,
      )}
    >
      {favorited ? (
        <span className="flex shrink-0 text-info" title={plain ? undefined : ui.chat.favoriteBadge}>
          <Star
            role={plain ? undefined : 'img'}
            aria-label={plain ? undefined : ui.chat.favoriteBadge}
            className="size-3"
            fill="currentColor"
            strokeWidth={0}
          />
        </span>
      ) : null}
      {message.pinned ? (
        <Pin
          role={plain ? undefined : 'img'}
          aria-label={plain ? undefined : ui.chat.menu.pin}
          className="size-3"
          strokeWidth={1.75}
        />
      ) : null}
      {message.urgent ? <UrgentAcksMeta messageId={message.id} onFilled={onFilled} /> : null}
      {message.editedAt ? <span>{ui.chat.edited}</span> : null}
      <time className="font-mono tabular-nums" dateTime={plain ? undefined : message.createdAt}>
        {formatTime(message.createdAt)}
      </time>
      {ticks ? (
        plain ? (
          // Копия-призрак: ГАЛОЧКИ без role/aria-label — ширина та же,
          // но e2e-локаторы (getByLabel 'просмотрено') видят только метку
          <svg width="15" height="10" viewBox="0 0 15 10" className="shrink-0">
            <path
              d={message.readBy.length > 0 ? 'M7.5 6.5 L9.5 8.5 L14.5 1.5' : ''}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1.5 5.5 L4.5 8.5 L10.5 1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <ReadTicks read={message.readBy.length > 0} />
        )
      ) : null}
    </span>
  );
}

/**
 * Мета срочного сообщения (#100): «Срочно · Ознакомились N/M» — отправитель
 * видит прогресс ознакомления live (WS notification.acked инвалидирует
 * ключ urgentAcks). Интеграционная точка журнала уведомлений в ЕДИНУЮ мету
 * мессенджера (второго хоста нет).
 */
function UrgentAcksMeta({ messageId, onFilled }: { messageId: string; onFilled: boolean }) {
  const status = useUrgentAcks(messageId);
  return (
    <>
      <span className={cn(onFilled ? 'font-semibold' : 'font-semibold text-danger')}>
        {ui.notifications.urgentMeta}
      </span>
      {status && status.expectedCount > 0 && (
        <span className="font-mono tabular-nums">
          {ui.notifications.urgentAcksMeta} {status.ackedCount}/{status.expectedCount}
        </span>
      )}
    </>
  );
}
