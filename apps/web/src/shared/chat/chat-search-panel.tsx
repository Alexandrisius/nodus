import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Funnel, Search, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { formatDayLabel } from './message-groups.js';
import { FavoriteHitRow } from './favorite-hit-row.js';
import { useConversationMessages } from './api.js';
import { useFavoriteLabels, useFavorites } from './favorites-api.js';
import { useJumpStore } from './jump-store.js';
import { filterNotesFlow, mergeNotesFlow, type NotesFilter } from './notes-flow.js';

/** Сколько строк показывать в «топ выдаче» (доработка релевантности — будущее). */
const TOP_N = 8;

/**
 * Панель поиска беседы (вердикт владельца 04.10, раунды 3–5; реф Битрикс24):
 * лупа в шапке раскрывает ПРАВУЮ панель — шапка-строка (назад/крестик +
 * пилюля поиска с лупой слева, очисткой и воронкой справа ВНУТРИ строки),
 * ниже — топ-выдача (строки: полное имя, текст до 3 строк, вложения
 * словами; группировка заголовками дат по центру; звезда-заливка справа
 * внизу); воронка раскрывает фильтры «продолжением строки вниз». Поверх
 * панели вложений — «назад», standalone — крестик. Выдача: в «Избранном» —
 * записи и карточки витрины; в обычных чатах/каналах — ИЗБРАННОЕ этого
 * чата; клик — классический прыжок с подсветкой (jump-store). Смонтирован
 * всегда (активация — `active`): первый выезд панели анимационно тот же,
 * что у вложений/участников. Смена беседы — сброс состояния.
 */
export function ChatSearchPanel({
  conversationId,
  isFavorites,
  active,
  overFiles,
  onBack,
  onClose,
  className,
}: {
  conversationId: string;
  /** Витрина «Избранного» (беседа с собой): поиск по записям и карточкам. */
  isFavorites: boolean;
  /** Вид активен (панель в режиме поиска): фокус строки без autoFocus. */
  active: boolean;
  /** Открыта ПОВЕРХ панели вложений — кнопка «назад» вместо крестика. */
  overFiles: boolean;
  onBack: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<NotesFilter>('all');
  const [labels, setLabels] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Смена беседы без ремаунта панели: состояние поиска — персонально беседе.
  useEffect(() => {
    setQ('');
    setFilter('all');
    setLabels([]);
    setFiltersOpen(false);
  }, [conversationId]);

  // Панель смонтирована всегда: фокус строки — при активации вида. Фокус
  // ПОСЛЕ выезда колонки (230мс > 200мс transition) и preventScroll:
  // фокус в кадре анимации дёргал скролл предков («гармошка», 04.10 р.6).
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 230);
    return () => window.clearTimeout(timer);
  }, [active, conversationId]);

  const { data: labelList } = useFavoriteLabels();
  const allLabels = labelList?.items ?? [];

  const messagesQuery = useConversationMessages(conversationId);
  const messages = useMemo(
    () => (messagesQuery.data?.items ?? []).filter((m) => !m.deletedAt),
    [messagesQuery.data],
  );
  // Обычные чаты/каналы: выдача — ИЗБРАННОЕ этого чата (реф Битрикс24).
  const favoritesQuery = useFavorites(isFavorites ? {} : { conversationId });
  const cards = useMemo(
    () => (favoritesQuery.data?.pages ?? []).flatMap((page) => page.items),
    [favoritesQuery.data],
  );

  const results = useMemo<SearchHit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (isFavorites) {
      const entries = filterNotesFlow(
        mergeNotesFlow(messages, cards),
        filter,
        needle || null,
        labels,
      );
      return entries
        .slice(-TOP_N)
        .reverse()
        .map((entry): SearchHit =>
          entry.kind === 'note'
            ? {
                id: entry.message.id,
                kind: 'note',
                author: entry.message.author.displayName,
                snippet: entry.message.text,
                attachments: entry.message.attachments.map((a) => a.kind),
                date: entry.message.createdAt,
                threadRootId: null,
              }
            : {
                id: entry.card.messageId,
                kind: 'favorite',
                author: entry.card.author.displayName,
                snippet: entry.card.text,
                attachments: entry.card.attachments.map((a) => a.kind),
                date: entry.card.createdAt,
                threadRootId: null,
              },
        );
    }
    return cards
      .filter((card) => !needle || card.text.toLowerCase().includes(needle))
      .slice(0, TOP_N)
      .map((card): SearchHit => ({
        id: card.messageId,
        kind: 'favorite',
        author: card.author.displayName,
        snippet: card.text,
        attachments: card.attachments.map((a) => a.kind),
        date: card.createdAt,
        threadRootId: card.threadRootId,
      }));
  }, [isFavorites, messages, cards, filter, labels, q]);

  const filtersActive = filter !== 'all' || labels.length > 0;

  function jump(entry: { id: string; threadRootId: string | null }) {
    // Классический прыжок с подсветкой: лента/витрина скроллятся к
    // messageId, вспышка — штатная (jump-store + JumpResponder хоста).
    useJumpStore.getState().request(conversationId, entry.id, entry.threadRootId);
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
      {/* Шапка-строка поиска (та же высота, что бар хоста — линии
          border-b продолжают друг друга): [назад/крестик] [пилюля поиска]. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        {overFiles ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent"
            onClick={onBack}
            aria-label={ui.chat.membersBack}
            title={ui.chat.membersBack}
          >
            <ArrowLeft />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent"
            onClick={onClose}
            aria-label={ui.common.close}
            title={ui.common.close}
          >
            <X />
          </Button>
        )}
        <span className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <input
            ref={inputRef}
            value={q}
            placeholder={ui.chat.searchPlaceholder}
            aria-label={ui.chat.searchMessages}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setQ('');
              }
            }}
            className={cn(
              // Тихий стиль приложения (композер/строки поиска): фон-muted
              // БЕЗ бордера и без рамки фокуса (белая рамка — «не наш стиль»,
              // вердикт 04.10 р.7).
              'h-8 w-full rounded-lg bg-muted/60 pl-7 text-sm outline-none transition-colors focus-visible:bg-muted',
              // Место под воронку (и ×-очистку) ВНУТРИ строки справа.
              isFavorites ? 'pr-[4.25rem]' : 'pr-8',
            )}
          />
          <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {q !== '' ? (
              <button
                type="button"
                aria-label={ui.chat.searchClear}
                title={ui.chat.searchClear}
                onClick={() => setQ('')}
                className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            ) : null}
            {/* Воронка — внутри строки (там, где есть фильтры: «Избранное»). */}
            {isFavorites ? (
              <button
                type="button"
                aria-label={ui.chat.searchFilters}
                aria-pressed={filtersActive}
                aria-expanded={filtersOpen}
                title={ui.chat.searchFilters}
                onClick={() => setFiltersOpen((v) => !v)}
                className={cn(
                  'ml-0.5 flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground',
                  filtersActive ? 'text-info' : 'text-muted-foreground',
                )}
              >
                <Funnel className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </span>
        </span>
      </div>

      {/* Расширение воронки — продолжение поисковой строки ВНИЗ (той же
          ширины): выезд grid-rows, как панель смайликов реакций. */}
      {isFavorites ? (
        <div
          className={cn(
            'grid shrink-0 transition-[grid-template-rows] duration-200 ease-out',
            filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2.5 border-b border-border px-3 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['notes', ui.chat.notesFilterNotes],
                    ['favorites', ui.chat.notesFilterFavorites],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(filter === value ? 'all' : value)}
                    aria-pressed={filter === value}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-body-xs transition-colors',
                      filter === value
                        ? 'bg-accent text-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {allLabels.length === 0 ? (
                <span className="text-xs text-muted-foreground/80">
                  {ui.chat.searchLabelsEmpty}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allLabels.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        setLabels((prev) =>
                          prev.includes(emoji)
                            ? prev.filter((label) => label !== emoji)
                            : [...prev, emoji],
                        )
                      }
                      aria-pressed={labels.includes(emoji)}
                      aria-label={emoji}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-sm leading-none transition-colors',
                        labels.includes(emoji)
                          ? 'bg-info-soft/60 text-info ring-1 ring-info/40'
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Топ выдачи: клик — классический прыжок с подсветкой. Группировка
          заголовками дат по центру (реф Битрикс24), время в строках НЕ
          пишется; звезда-заливка — справа внизу строки. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {q.trim() === '' && !filtersActive && cards.length === 0 && !isFavorites ? (
          <span className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
            <Search className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground/80">{ui.chat.favoritesEmpty}</span>
          </span>
        ) : q.trim() === '' && !filtersActive ? (
          <span className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
            <Search className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground/80">{ui.chat.searchHint}</span>
          </span>
        ) : results.length === 0 ? (
          <span className="px-2 py-2 text-xs text-muted-foreground/80">
            {ui.chat.searchNoResults}
          </span>
        ) : (
          results.map((entry, index) => {
            const prev = results[index - 1];
            const day = formatDayLabel(entry.date);
            const newDay = prev === undefined || formatDayLabel(prev.date) !== day;
            return (
              <Fragment key={entry.id}>
                {newDay ? (
                  <span className="pb-1 pt-2 text-center text-xs text-muted-foreground">{day}</span>
                ) : null}
                <FavoriteHitRow
                  author={entry.author}
                  snippet={entry.snippet}
                  attachments={entry.attachments}
                  favorited={entry.kind === 'favorite'}
                  onJump={() => jump(entry)}
                />
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

interface SearchHit {
  id: string;
  kind: 'note' | 'message' | 'favorite';
  author: string;
  snippet: string;
  attachments: ('image' | 'file' | 'sticker')[];
  date: string;
  threadRootId: string | null;
}
