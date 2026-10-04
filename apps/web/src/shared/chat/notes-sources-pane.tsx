import { ChevronRight, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import { useConversations } from './api.js';
import { ConversationAvatar } from './conversation-avatar.js';
import type { NotesSourceId } from './notes-flow.js';
import { useFavoriteSources } from './vault-api.js';
import { NotesGlyph } from '../ui/notes-glyph.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { formatDateTimeShort } from '../lib/format.js';

export type { NotesSourceId };

/**
 * Панель «Избранное по чатам» (#211 Ф3, реф Telegram Saved Messages):
 * контент правой панели чата «Избранное» — счётчики типов всего избранного
 * в шапке + список чатов-источников (аватар, название, дата последней
 * закладки, счётчик); первым — псевдоисточник «Записи». Клик — хост
 * открывает окно-фильтр (лента, отфильтрованная по источнику).
 */
export function NotesSourcesPane({
  onOpenSource,
}: {
  onOpenSource: (source: NotesSourceId) => void;
}) {
  const sources = useFavoriteSources();
  const { data: conversations } = useConversations();
  const byId = new Map((conversations?.items ?? []).map((c) => [c.id, c]));
  const list = sources.data?.sources ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Счётчики типов всего избранного (шапка панели, реф Telegram). */}
      <nav className="flex shrink-0 flex-col gap-0.5" aria-label={ui.chat.vaultSources}>
        {(
          [
            [ui.chat.vaultMedia, sources.data?.counts.media ?? 0, ImageIcon],
            [ui.chat.vaultDocuments, sources.data?.counts.document ?? 0, FileText],
            [ui.chat.vaultLinks, sources.data?.counts.link ?? 0, Link2],
          ] as const
        ).map(([label, count, Icon]) => (
          <span
            key={label}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5',
              count === 0 && 'opacity-45',
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="flex-1 truncate text-sm">{label}</span>
            <span className="font-mono text-label-sm tabular-nums text-muted-foreground">
              {count}
            </span>
          </span>
        ))}
      </nav>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {/* Псевдоисточник «Записи» — первый (свои сообщения, не звёзды). */}
        <button
          type="button"
          onClick={() => onOpenSource('notes')}
          aria-label={ui.chat.vaultSourceOpen}
          className="group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/60">
            <NotesGlyph className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{ui.chat.notesFilterNotes}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {sources.data?.notes.lastAt ? formatDateTimeShort(sources.data.notes.lastAt) : ''}
            </span>
          </span>
          <span className="font-mono text-label-sm tabular-nums text-muted-foreground">
            {sources.data?.notes.count ?? 0}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.75}
          />
        </button>

        {list.length === 0 && !sources.isLoading ? (
          <div className="flex min-h-24 items-center justify-center">
            <Empty>
              <EmptyTitle>{ui.chat.vaultSourcesEmpty}</EmptyTitle>
            </Empty>
          </div>
        ) : null}

        {list.map((source) => {
          const conversation = byId.get(source.conversationId);
          const title =
            conversation?.title ??
            source.title ??
            (source.conversationType === 'task'
              ? ui.chat.taskChat
              : source.conversationType === 'letter'
                ? ui.chat.letterChat
                : source.conversationId);
          return (
            <button
              key={source.conversationId}
              type="button"
              onClick={() => onOpenSource(source.conversationId)}
              aria-label={ui.chat.vaultSourceOpen}
              className="group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent"
            >
              {conversation ? (
                <ConversationAvatar conversation={conversation} className="size-9" />
              ) : (
                <PersonAvatar name={title} className="size-9" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatDateTimeShort(source.lastFavoritedAt)}
                </span>
              </span>
              <span className="font-mono text-label-sm tabular-nums text-muted-foreground">
                {source.count}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
