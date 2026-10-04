import { ArrowLeft, X } from 'lucide-react';
import { Fragment, useMemo, useRef } from 'react';
import { ui, type FavoriteCard } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../auth-store.js';
import { useConversationMessages } from './api.js';
import { DayChip } from './day-chip.js';
import { toFavoriteMessage } from './favorite-message.js';
import { useFavorites } from './favorites-api.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { FavoriteRunMessage } from './notes-row.js';
import { filterNotesFlowBySource, mergeNotesFlow, type NotesSourceId } from './notes-flow.js';
import { MessageRunView } from './message-run.js';
import { useOptimisticFavoriteLabels } from './optimistic-favorite-labels.js';
import { useFrameReady } from '../ui/use-frame-ready.js';

/**
 * Окно-источник «Избранного» (#211 Ф3, вердикт владельца 04.10): клик по
 * строке источника в панели — главное окно сменяется лентой, ВЫЕЗЖАЮЩЕЙ
 * СПРАВА НАЛЕВО (реф Telegram Saved): визуально та же витрина «Избранного»
 * (тот же конвейер пузырей), но поток отфильтрован по источнику — только его
 * звёзды, псевдоисточник «Записи» — только свои записи. Возврат — «назад»
 * слева и крестик у края (закон колонки). Обёртка смонтирована ПОСТОЯННО
 * (w-0 в покое — закон выдвижных поверхностей: переход с первого кадра и
 * после Ctrl+R), контент ленив на первом открытии и далее остаётся.
 * Композера нет: это просмотр среза, ввод живёт в самой витрине.
 */
export function NotesSourceWindow({
  conversationId,
  source,
  title,
  onClose,
}: {
  /** Беседа «Избранное». */
  conversationId: string;
  source: NotesSourceId | null;
  title: string;
  onClose: () => void;
}) {
  const openedRef = useRef<NotesSourceId | null>(null);
  if (source !== null) openedRef.current = source;
  const ready = useFrameReady();

  const meId = useAuthStore((s) => s.user?.id ?? null);
  const messagesQuery = useConversationMessages(conversationId);
  const favoritesQuery = useFavorites();
  const optimisticLabels = useOptimisticFavoriteLabels((s) => s.labels);

  const messages = useMemo(
    () => (messagesQuery.data?.items ?? []).filter((m) => !m.deletedAt),
    [messagesQuery.data],
  );
  const cards = useMemo(
    () => (favoritesQuery.data?.pages ?? []).flatMap((page) => page.items),
    [favoritesQuery.data],
  );
  const feedCards = useMemo(
    () => cards.filter((card) => !messages.some((m) => m.id === card.messageId)),
    [cards, messages],
  );
  const entries = useMemo(() => mergeNotesFlow(messages, feedCards), [messages, feedCards]);
  const filtered = useMemo(
    () => (source !== null && meId ? filterNotesFlowBySource(entries, source, meId) : []),
    [entries, source, meId],
  );
  const items = useMemo(
    () =>
      filtered.map((entry) =>
        entry.kind === 'note' ? entry.message : toFavoriteMessage(entry.card),
      ),
    [filtered],
  );
  const runs = useMemo(() => buildMessageRuns(items, meId ?? undefined), [items, meId]);
  const cardById = useMemo(() => {
    const map = new Map<string, FavoriteCard>();
    for (const entry of filtered) {
      if (entry.kind === 'favorite') map.set(entry.card.messageId, entry.card);
    }
    return map;
  }, [filtered]);

  return (
    <div
      aria-hidden={source === null}
      inert={source === null}
      className="pointer-events-none absolute inset-0 z-10 flex justify-end"
    >
      <div
        className={cn(
          'pointer-events-auto flex h-full min-w-0 flex-col overflow-hidden border-l border-border bg-card transition-[width] duration-200 ease-out',
          source !== null && ready ? 'w-full' : 'w-0',
        )}
      >
        {openedRef.current !== null ? (
          <>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 hover:bg-accent"
                onClick={onClose}
                aria-label={ui.chat.vaultBackToAll}
                title={ui.chat.vaultBackToAll}
              >
                <ArrowLeft />
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 hover:bg-accent"
                onClick={onClose}
                aria-label={ui.common.close}
              >
                <X />
              </Button>
            </div>
            <MessageScrollerProvider autoScroll>
              <MessageScroller className="min-h-0 flex-1 bg-chat-zone">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="feed-reveal flex flex-col gap-3 px-4 pt-4 pb-3">
                    {items.length === 0 && !messagesQuery.isLoading && !favoritesQuery.isLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <Empty>
                          <EmptyTitle>{ui.chat.vaultSourcesEmpty}</EmptyTitle>
                        </Empty>
                      </div>
                    ) : (
                      <MessageGroup className="gap-3">
                        {runs.map((run, runIndex) => {
                          const prevRun = runIndex === 0 ? undefined : runs[runIndex - 1];
                          return (
                            <Fragment key={run.first.id}>
                              {startsNewDay(prevRun?.last, run.first) ? (
                                <MessageScrollerItem>
                                  <DayChip label={formatDayLabel(run.first.createdAt)} />
                                </MessageScrollerItem>
                              ) : null}
                              <MessageRunView
                                run={run}
                                showName={!run.mine}
                                renderItem={(message, attrs) => (
                                  <FavoriteRunMessage
                                    message={message}
                                    card={cardById.get(message.id) ?? null}
                                    labelTarget={
                                      // Канон витрины (#215): локальная метка
                                      // первична до сходимости кэша.
                                      optimisticLabels.has(message.id)
                                        ? {
                                            messageId: message.id,
                                            labels: optimisticLabels.get(message.id)!,
                                          }
                                        : (cardById.get(message.id) ?? {
                                            messageId: message.id,
                                            labels: [],
                                          })
                                    }
                                    mine={run.mine}
                                    showName={attrs.showName}
                                    tail={attrs.tail}
                                    style={attrs.style}
                                    conversationId={conversationId}
                                    scope={`notes-source:${openedRef.current}`}
                                    selectionActive={false}
                                    selectedSet={EMPTY_SET}
                                    onToggle={() => {}}
                                  />
                                )}
                              />
                            </Fragment>
                          );
                        })}
                      </MessageGroup>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
              </MessageScroller>
            </MessageScrollerProvider>
          </>
        ) : null}
      </div>
    </div>
  );
}

const EMPTY_SET = new Set<string>();
