import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PresenceEntry } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';

const dotColor: Record<string, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-foreground/30',
};

function ColleagueRow({
  entry,
  withName,
  onOpen,
}: {
  entry: PresenceEntry;
  withName: boolean;
  onOpen: (userId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.user.id)}
      className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
    >
      <span className="relative shrink-0">
        <PersonAvatar
          name={entry.user.displayName}
          avatarUrl={entry.user.avatarUrl}
          className="size-7"
        />
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-card',
            dotColor[entry.status],
          )}
        />
      </span>
      {withName ? (
        <span className="truncate text-[13px] text-foreground">{entry.user.displayName}</span>
      ) : null}
    </button>
  );
}

/**
 * Полоса коллег (каркас §10.2, вердикт владельца 12.09.2026): колонка 40px
 * ВНУТРИ мягкой рамы, на её фоне, ОБРЕЗАННАЯ СВЕРХУ осью контура (начинается
 * под главной линией, под аватаркой профиля); мягкая зона при этом идёт до
 * самого края экрана с обычным зазором 8px. Раскрытие по dwell ≥ 800 мс —
 * оверлейная панель 240px под аватаркой профиля (контент не переживает
 * reflow); клик по коллеге — быстрый переход в чат. Список компактный,
 * прокрутка колёсиком без видимого скроллбара.
 */
export function RightRail() {
  const { data } = usePresence();
  const { data: chats } = useConversations();
  const navigate = useNavigate();
  const [edgeOpen, setEdgeOpen] = useState(false);
  const dwellTimer = useRef<number | null>(null);

  function dwellStart() {
    if (dwellTimer.current !== null) return;
    dwellTimer.current = window.setTimeout(() => {
      dwellTimer.current = null;
      setEdgeOpen(true);
    }, 800);
  }

  function dwellStop() {
    if (dwellTimer.current !== null) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
    setEdgeOpen(false);
  }

  useEffect(
    () => () => {
      if (dwellTimer.current !== null) clearTimeout(dwellTimer.current);
    },
    [],
  );

  function openChat(userId: string) {
    const direct = (chats?.items ?? []).find(
      (c) => c.type === 'direct' && c.membersPreview.some((m) => m.id === userId),
    );
    if (direct)
      void navigate({ to: '/chat/$conversationId', params: { conversationId: direct.id } });
    else void navigate({ to: '/chat' });
  }

  const online = (data ?? []).filter((p) => p.status !== 'offline');

  return (
    <aside
      onMouseEnter={dwellStart}
      onMouseLeave={dwellStop}
      className="relative flex w-10 shrink-0 flex-col border-l border-sidebar-border"
    >
      <div
        data-no-scrollbar
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-2 pb-1"
      >
        {online.map((entry) => (
          <ColleagueRow key={entry.user.id} entry={entry} withName={false} onOpen={openChat} />
        ))}
      </div>
      {/* Раскрытие — ПЛАВНОЕ (вердикт владельца 12.09.2026: «резко
          выпрыгивает»): панель смонтирована всегда и выезжает transform'ом
          из-за правого края рамы (обрезается её overflow-hidden); inert
          выключает её из фокуса/a11y в свёрнутом состоянии. */}
      <div
        inert={!edgeOpen}
        className={cn(
          // БЕЗ slider-shadow: глубокая тень поверх контента рамы читалась
          // «разлитыми пятнами» слева от панели (вердикт владельца
          // 12.09.2026); отделение — бордюром, как у зон рамы.
          'absolute inset-y-0 right-0 z-30 flex w-60 flex-col border-l border-sidebar-border bg-card transition-transform duration-200 ease-out',
          edgeOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <div
          data-no-scrollbar
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-2 pb-1"
        >
          {online.map((entry) => (
            <ColleagueRow key={entry.user.id} entry={entry} withName onOpen={openChat} />
          ))}
        </div>
      </div>
    </aside>
  );
}
