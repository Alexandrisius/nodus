import { Mail, Paperclip, ScanLine } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useInfiniteSentinel } from '../../../../shared/views/use-infinite-sentinel.js';
import { letterSubject, receivedLabel } from '../../lib/letter-format.js';

/**
 * Очередь «Новые» (#55, U4): письмо — строка с темой (у скана — «Письмо без
 * темы»), источником, числом файлов и временем поступления; выбранное —
 * подсветка и порт. ↑/↓ в списке — соседнее письмо, Enter — в форму.
 * Удаление спама — из формы/«Ещё» и Shift+Delete (вне поля ввода).
 */
export function NewLettersList({
  letters,
  selectedId,
  onSelect,
  onEnter,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: {
  letters: LetterListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Enter на письме — фокус в форму регистрации. */
  onEnter: () => void;
  /** Курсорная подгрузка очереди (sentinel у дна, как в журналах). */
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteSentinel(listRef, sentinelRef, { hasNextPage, isFetchingNextPage, onLoadMore });

  // Выбранное письмо всегда в поле зрения (Alt+↑/↓, переход после регистрации).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-letter-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={ui.letters.pipeline.listLabel}
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      onKeyDown={(e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const index = letters.findIndex((l) => l.id === selectedId);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next =
            letters[
              Math.min(letters.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))
            ];
          if (next) {
            onSelect(next.id);
            listRef.current?.querySelector<HTMLElement>(`[data-letter-id="${next.id}"]`)?.focus();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      {letters.map((letter) => {
        const selected = letter.id === selectedId;
        const Source = letter.source === 'manual' ? ScanLine : Mail;
        return (
          <button
            key={letter.id}
            type="button"
            role="option"
            aria-selected={selected}
            data-letter-id={letter.id}
            tabIndex={selected || (!selectedId && letter === letters[0]) ? 0 : -1}
            onClick={() => onSelect(letter.id)}
            className={cn(
              'flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-ring',
              selected
                ? 'bg-accent text-foreground'
                : 'text-secondary-foreground hover:bg-accent/50',
            )}
          >
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  'line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-medium wrap-anywhere',
                  !letter.subject && 'text-muted-foreground',
                )}
              >
                {letterSubject(letter)}
              </span>
              <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                {receivedLabel(letter.receivedAt)}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Source className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 truncate">
                {letter.counterparty?.name ?? ui.letters.source[letter.source]}
              </span>
              {letter.attachmentCount > 0 ? (
                <span className="ml-auto flex shrink-0 items-center gap-0.5 font-mono tabular-nums">
                  <Paperclip className="size-3" strokeWidth={1.75} aria-hidden />
                  {letter.attachmentCount}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
      {hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {isFetchingNextPage ? <Skeleton className="h-16 w-full rounded-[10px]" /> : null}
        </div>
      ) : null}
    </div>
  );
}
