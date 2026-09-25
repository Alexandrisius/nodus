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
 * Pill просмотров своего последнего сообщения (#102 раунд 2 → раунд 3):
 * ПЛАВАЮЩИЙ оверлей в контейнере ленты — прижат к НИЗУ СЛЕВА, в зазоре между
 * последним сообщением и верхним краем области ввода (вердикт владельца:
 * flow-строка на всю ширину справа «толкает» сообщения). Лейаут ленты
 * НЕИЗМЕНЕН (absolute), pointer-events — только на самом pill (имя/«и ещё N»
 * кликабельны); фон полупрозрачный с мягкими краями вокруг текста
 * (bg-card/70 + backdrop-blur, скругление pill), появление — плавный выезд
 * снизу-вверх + fade (views-pill, @starting-style). Один компонент для трёх
 * лент: беседа (conversation-pane), тред (thread-pane), лента канала
 * (thread-feed) — «своё последнее сообщение» в переданном окне сообщений.
 */

/** Попап посмотревших (вверх от якоря): аватарки + ФИО, скролл для длинных.
 *  Якорь — виртуальный (pill или строка сообщения из ПКМ-меню). */
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
        align="start"
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
 * Pill просмотров (оверлей): рендерить ВНУТРИ relative-контейнера ленты.
 * Прямой доступ к «последнему своему» — по загруженному окну переданных
 * сообщений: последнее своё сообщение ВНЕ окна (глубокая история) — pill нет.
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
      <div className="pointer-events-none absolute bottom-1.5 left-4 z-10">
        <div className="views-pill flex items-center gap-1.5 rounded-full bg-card/70 px-2.5 py-1 text-badge text-muted-foreground shadow-none backdrop-blur-sm">
          <ReadTicks read />
          <span>
            {ui.chat.readByLabel}: {humanDay}, {formatTime(lastOwn.readAt)}
          </span>
        </div>
      </div>
    );
  }

  const viewers = lastOwn.readBy;
  if (viewers.length === 0) return null;
  const first = viewers[0]!;
  const more = viewers.length - 1;

  return (
    <div className="pointer-events-none absolute bottom-1.5 left-4 z-10">
      <div className="views-pill flex items-center gap-1.5 rounded-full bg-card/70 px-2.5 py-1 text-badge text-muted-foreground shadow-none backdrop-blur-sm">
        <ReadTicks read />
        <span>{ui.chat.readByLabel}:</span>
        <button
          type="button"
          className="pointer-events-auto rounded-full underline decoration-dotted underline-offset-2 hover:text-foreground"
          onClick={(e) => setPopupAnchor(e.currentTarget)}
        >
          {first.displayName}
        </button>
        {more > 0 ? (
          <button
            type="button"
            className="pointer-events-auto rounded-full font-mono underline decoration-dotted underline-offset-2 tabular-nums hover:text-foreground"
            onClick={(e) => setPopupAnchor(e.currentTarget)}
          >
            {ui.chat.andMore} {more}
          </button>
        ) : null}
      </div>
      <ViewsPopup anchor={popupAnchor} viewers={viewers} onClose={() => setPopupAnchor(null)} />
    </div>
  );
}
