import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';

const dotColor: Record<string, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-foreground/30',
};

/**
 * Правая полоса коллег (каркас §10.2): узкая полоса 40px под главной линией
 * (обрезана ею, как в Битрикс24), поверх контента; скроллбар контента — у
 * левого шва полосы. Плавно раскрывается до панели с полными именами, когда
 * курсор задержался над зоной полосы ≥ 400 мс (задержка гасит ложные
 * срабатывания при пролёте курсора); закрывается, когда курсор покидает
 * панель. Ручного сворачивания нет — полоса и есть минимальное состояние.
 * Список — компактный (сотни людей), прокрутка колёсиком без видимого
 * скроллбара. Клик по коллеге — быстрый переход в чат.
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
    }, 400);
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

  return (
    <aside
      onMouseEnter={dwellStart}
      onMouseLeave={dwellStop}
      className={cn(
        'absolute top-14 right-1.5 bottom-0 z-20 flex flex-col border-l border-sidebar-border bg-sidebar transition-[width] duration-300 ease-out',
        edgeOpen ? 'w-60' : 'w-10',
      )}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div
          data-no-scrollbar
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-2 pb-1"
        >
          {data
            ?.filter((p) => p.status !== 'offline')
            .map((entry) => (
              <button
                key={entry.user.id}
                type="button"
                onClick={() => openChat(entry.user.id)}
                className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent"
              >
                <span className="relative shrink-0">
                  <PersonAvatar
                    name={entry.user.displayName}
                    avatarUrl={entry.user.avatarUrl}
                    className="size-7"
                  />
                  <span
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-sidebar',
                      dotColor[entry.status],
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'truncate text-[13px] text-sidebar-foreground transition-opacity delay-75 duration-200',
                    edgeOpen ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {entry.user.displayName}
                </span>
              </button>
            ))}
        </div>
      </div>
    </aside>
  );
}
