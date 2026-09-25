import { useMemo, useState } from 'react';
import type { ChatMessage, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { PersonAvatar } from '../ui/person-avatar.js';
import { formatTime } from '../lib/format.js';
import { useAuthStore } from '../auth-store.js';
import { useConversations } from './api.js';
import { formatDayLabel } from './message-groups.js';
import { ReadTicks } from './read-ticks.js';

/**
 * Строка просмотров НАД областью ввода (#102 раунд 2, вердикт владельца —
 * «точно Битрикс», без строки под каждым сообщением): ОДНА строка на беседу
 * для СВОЕГО последнего сообщения в загруженном окне. Группы/каналы —
 * «✓✓ Просмотрено: {Имя} и ещё N» (N/имя кликабельны → попап вверх со всеми
 * посмотревшими); direct — «✓✓ Просмотрено: {дата}, {время}» (человеческая
 * дата как в дата-чипах). Не просмотрено/нет своих сообщений — строки нет.
 */

/** Попап посмотревших (вверх от якоря): аватарки + ФИО, скролл для длинных.
 *  Якорь — виртуальный (строка просмотров или строка сообщения из ПКМ-меню). */
export function ViewsPopup({
  anchor,
  viewers,
  onClose,
}: {
  anchor: HTMLElement | null;
  viewers: UserRef[];
  onClose: () => void;
}) {
  // virtualRef пересобирается под текущий якорь; anchor=null → закрыт.
  const virtualRef = useMemo(() => ({ current: anchor }), [anchor]);
  return (
    <Popover
      open={anchor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="top"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-64 p-0"
      >
        <ViewsPopupBody viewers={viewers} />
      </PopoverContent>
    </Popover>
  );
}

function ViewsPopupBody({ viewers }: { viewers: UserRef[] }) {
  return (
    <div data-slot="views-popup" className="flex flex-col">
      <span className="px-3 pt-2.5 pb-1.5 text-label-sm font-medium text-muted-foreground">
        {ui.chat.whoViewed}
      </span>
      <div className="max-h-64 overflow-y-auto px-1.5 pb-1.5">
        {viewers.map((viewer) => (
          <span key={viewer.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
            <PersonAvatar
              name={viewer.displayName}
              avatarUrl={viewer.avatarUrl}
              className="size-6 shrink-0"
            />
            <span className="min-w-0 truncate text-sm">{viewer.displayName}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Строка просмотров своего последнего сообщения (внизу беседы, над
 * композером). Прямой доступ к «последнему своему» — по загруженному окну
 * ленты: последнее своё сообщение ВНЕ окна (глубокая история) — строки нет.
 */
export function ConversationViewsLine({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: readonly ChatMessage[];
}) {
  const me = useAuthStore((s) => s.user);
  const { data } = useConversations();
  const conversation = data?.items.find((c) => c.id === conversationId) ?? null;
  const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null);

  const lastOwn = useMemo(
    () => [...messages].reverse().find((m) => m.author.id === me?.id && !m.deletedAt) ?? null,
    [messages, me?.id],
  );

  if (!conversation || !lastOwn) {
    return null;
  }

  // Direct (и «Заметки»): просмотры = факт собеседника; показываем ВРЕМЯ
  // первого просмотра, попапа нет (модель Telegram — просто галочки).
  if (conversation.type === 'direct') {
    if (lastOwn.readAt === null) return null;
    const day = formatDayLabel(lastOwn.readAt);
    const humanDay = day.charAt(0).toLowerCase() + day.slice(1);
    return (
      <div className="flex shrink-0 items-center justify-end gap-1.5 px-4 pb-1 text-badge text-muted-foreground">
        <ReadTicks read />
        <span>
          {ui.chat.readByLabel}: {humanDay}, {formatTime(lastOwn.readAt)}
        </span>
      </div>
    );
  }

  const viewers = lastOwn.readBy;
  if (viewers.length === 0) return null;
  const first = viewers[0]!;
  const more = viewers.length - 1;

  return (
    <div className="flex shrink-0 items-center justify-end gap-1 px-4 pb-1 text-badge text-muted-foreground">
      <ReadTicks read />
      <span>{ui.chat.readByLabel}:</span>
      <button
        type="button"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        onClick={(e) => setPopupAnchor(e.currentTarget)}
      >
        {first.displayName}
      </button>
      {more > 0 ? (
        <button
          type="button"
          className="font-mono underline decoration-dotted underline-offset-2 tabular-nums hover:text-foreground"
          onClick={(e) => setPopupAnchor(e.currentTarget)}
        >
          {ui.chat.andMore} {more}
        </button>
      ) : null}
      <ViewsPopup anchor={popupAnchor} viewers={viewers} onClose={() => setPopupAnchor(null)} />
    </div>
  );
}
