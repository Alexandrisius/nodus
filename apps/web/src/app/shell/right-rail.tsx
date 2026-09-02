import { ChevronsRight, ChevronsLeft } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nodus/ui/components/tooltip';

import { usePresence } from '../../features/directory/api/directory-api.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';

const dotColor: Record<string, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-muted-foreground/40',
};

/** Правая полоса аватарок онлайн 56px (каркас §10.2). */
export function RightRail() {
  const collapsed = useShellStore((s) => s.railCollapsed);
  const toggle = useShellStore((s) => s.toggleRail);
  const { data } = usePresence();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.expandRail}
        className="flex w-6 shrink-0 items-center justify-center border-l bg-card text-muted-foreground hover:bg-accent"
      >
        <ChevronsLeft className="size-4" />
      </button>
    );
  }

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-l bg-card py-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
        {data?.filter((p) => p.status === 'online').length ?? 0}
      </span>
      <TooltipProvider>
        {data
          ?.filter((p) => p.status !== 'offline')
          .map((entry) => (
            <Tooltip key={entry.user.id}>
              <TooltipTrigger asChild>
                <span className="relative">
                  <PersonAvatar
                    name={entry.user.displayName}
                    avatarUrl={entry.user.avatarUrl}
                    className="size-9"
                  />
                  <span
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card',
                      dotColor[entry.status],
                    )}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                {entry.user.displayName} ·{' '}
                {entry.status === 'online' ? ui.common.online : ui.common.offline}
              </TooltipContent>
            </Tooltip>
          ))}
      </TooltipProvider>
      <button
        type="button"
        onClick={toggle}
        aria-label={ui.topbar.collapseRail}
        className="mt-auto text-muted-foreground hover:text-foreground"
      >
        <ChevronsRight className="size-4" />
      </button>
    </aside>
  );
}
