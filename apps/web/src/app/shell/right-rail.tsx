import { ChevronsRight, ChevronsLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';

const dotColor: Record<string, string> = {
  online: 'bg-sage',
  away: 'bg-ochre',
  offline: 'bg-foreground/30',
};

/**
 * Правая полоса коллег (каркас §10.2): 56px, плавно раскрывается до панели
 * с полными именами, когда курсор задержался над зоной полосы ≥ 400 мс
 * (задержка гасит ложные срабатывания при пролёте курсора, в том числе на
 * многомониторных конфигурациях); закрывается, когда курсор покидает панель.
 * Клик по коллеге — быстрый переход в чат.
 */
export function RightRail() {
  const collapsed = useShellStore((s) => s.railCollapsed);
  const toggle = useShellStore((s) => s.toggleRail);
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

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.expandRail}
        className="flex w-6 shrink-0 items-center justify-center border-l border-sidebar-border bg-sidebar/70 text-sidebar-foreground/60 backdrop-blur-[2px] hover:bg-sidebar-accent"
      >
        <ChevronsLeft className="size-4" />
      </button>
    );
  }

  function openChat(userId: string) {
    const direct = (chats?.items ?? []).find(
      (c) => c.type === 'direct' && c.membersPreview.some((m) => m.id === userId),
    );
    if (direct)
      void navigate({ to: '/chat/$conversationId', params: { conversationId: direct.id } });
    else void navigate({ to: '/chat' });
  }

  const online = data?.filter((p) => p.status === 'online').length ?? 0;

  return (
    <aside
      onMouseEnter={dwellStart}
      onMouseLeave={dwellStop}
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar/70 backdrop-blur-[2px] transition-[width] duration-300 ease-out',
        edgeOpen ? 'w-64' : 'w-14',
      )}
    >
      <div className="flex h-8 items-center gap-2 px-3.5 pt-3 pb-1">
        <span className="text-[11px] font-semibold text-sidebar-foreground/60 tabular-nums">
          {online}
        </span>
        <span
          className={cn(
            'text-[11px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase transition-opacity duration-200',
            edgeOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          {ui.topbar.onlineColleagues}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 py-1">
        {data
          ?.filter((p) => p.status !== 'offline')
          .map((entry) => (
            <button
              key={entry.user.id}
              type="button"
              onClick={() => openChat(entry.user.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3.5 py-1.5 text-left hover:bg-sidebar-accent"
            >
              <span className="relative shrink-0">
                <PersonAvatar
                  name={entry.user.displayName}
                  avatarUrl={entry.user.avatarUrl}
                  className="size-9"
                />
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar',
                    dotColor[entry.status],
                  )}
                />
              </span>
              <span
                className={cn(
                  'truncate text-sm text-sidebar-foreground transition-opacity delay-75 duration-200',
                  edgeOpen ? 'opacity-100' : 'opacity-0',
                )}
              >
                {entry.user.displayName}
              </span>
            </button>
          ))}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.collapseRail}
        className="flex h-9 items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground"
      >
        <ChevronsRight className="size-4" />
      </button>
    </aside>
  );
}
