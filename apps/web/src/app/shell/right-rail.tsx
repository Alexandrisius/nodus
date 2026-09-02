import { ChevronsRight, ChevronsLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';

const dotColor: Record<string, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-white/30',
};

/**
 * Правая полоса коллег (каркас §10.2): 56px, по наведению плавно раскрывается
 * до панели с полными именами; клик — быстрый переход в чат.
 */
export function RightRail() {
  const collapsed = useShellStore((s) => s.railCollapsed);
  const toggle = useShellStore((s) => s.toggleRail);
  const { data } = usePresence();
  const { data: chats } = useConversations();
  const navigate = useNavigate();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.expandRail}
        className="flex w-6 shrink-0 items-center justify-center border-l border-white/10 bg-[#0B1524]/70 text-white/60 backdrop-blur-xl hover:bg-white/10"
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
    <aside className="group flex w-14 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0B1524]/70 backdrop-blur-xl transition-[width] duration-300 ease-out hover:w-64">
      <div className="flex h-8 items-center gap-2 px-3.5 pt-3 pb-1">
        <span className="text-[11px] font-semibold text-white/50 tabular-nums">{online}</span>
        <span className="text-[11px] font-semibold tracking-wider text-white/40 uppercase opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
              className="flex w-full items-center gap-3 rounded-lg px-3.5 py-1.5 text-left hover:bg-white/10"
            >
              <span className="relative shrink-0">
                <PersonAvatar
                  name={entry.user.displayName}
                  avatarUrl={entry.user.avatarUrl}
                  className="size-9"
                />
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[#0B1524]',
                    dotColor[entry.status],
                  )}
                />
              </span>
              <span className="truncate text-sm text-white/85 opacity-0 transition-opacity delay-75 duration-200 group-hover:opacity-100">
                {entry.user.displayName}
              </span>
            </button>
          ))}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.collapseRail}
        className="flex h-9 items-center justify-center text-white/50 hover:text-white"
      >
        <ChevronsRight className="size-4" />
      </button>
    </aside>
  );
}
