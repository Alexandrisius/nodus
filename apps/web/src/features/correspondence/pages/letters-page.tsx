import { MailOpen, PenLine } from 'lucide-react';
import { Outlet, useNavigate, useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatDateTime } from '../../../shared/lib/format.js';
import { useLettersList, useRegisterLetter, type LettersFolder } from '../api/letters-api.js';
import { LetterStatusBadge } from '../components/letter-status-badge.js';

/** Журнал писем: папки в топбаре; очередь «Незарегистрированные» — с регистрацией. */
export function LettersPage() {
  const search = useSearch({ strict: false }) as { folder?: string };
  const folder: LettersFolder = (['unregistered', 'incoming', 'outgoing'] as const).includes(
    search.folder as LettersFolder,
  )
    ? (search.folder as LettersFolder)
    : 'incoming';

  const { data, isLoading } = useLettersList(folder);
  const register = useRegisterLetter();
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-white drop-shadow-sm">{ui.letters.title}</h1>
        <Button size="sm">
          <PenLine data-icon="inline-start" />
          {ui.letters.compose}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <Empty className="text-white">
            <EmptyTitle>{ui.common.empty}</EmptyTitle>
            <EmptyDescription className="text-white/60">{ui.letters.title}</EmptyDescription>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {(data?.items ?? []).map((letter) => (
              <div
                key={letter.id}
                className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0 hover:bg-accent/50"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  onClick={() =>
                    void navigate({ to: '/letters/$letterId', params: { letterId: letter.id } })
                  }
                >
                  <MailOpen className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{letter.correspondent}</span>
                      <LetterStatusBadge status={letter.status} />
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {letter.subject}
                    </span>
                  </span>
                  <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground md:block">
                    {letter.regNumber ?? formatDateTime(letter.receivedAt)}
                  </span>
                </button>
                {folder === 'unregistered' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={register.isPending}
                    onClick={() => register.mutate(letter.id)}
                  >
                    {ui.letters.register}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Outlet />
    </div>
  );
}
