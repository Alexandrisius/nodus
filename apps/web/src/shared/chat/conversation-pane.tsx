import { Fragment, useMemo } from 'react';
import { MessageScrollerProvider } from '@nodus/ui/components/message-scroller';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { DayChip } from './day-chip.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { MessageMenu } from './message-menu.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ui } from '@nodus/contracts';

/**
 * Обычная беседа (групповой/личный чат, ответы треда): лента сообщений на
 * MessageScroller (авто-скролл, кнопка «вниз») + композер. Сообщения
 * сгруппированы в серии одного автора (план docs/mvp/chat-messages-plan.md):
 * внутри серии зазор 2px, между сериями 12px; имя — только чужое и только у
 * первого сообщения серии (в личных чатах имён нет вовсе, `showAuthor`),
 * аватар и хвостик — у последнего; при смене дня — дата-чип. Действия над
 * сообщением — контекстное меню по правому клику (модель Битрикс24,
 * «Создать задачу» — поток Б). Правая панель беседы — у контейнера
 * (шапка беседы), не у пейна. Пустое состояние — канонический Empty.
 */
export function ConversationPane({
  conversationId,
  showAuthor = true,
  composerPlaceholder = ui.chat.newMessage,
  emptyLabel = ui.chat.directEmpty,
}: {
  conversationId: string;
  showAuthor?: boolean;
  composerPlaceholder?: string;
  emptyLabel?: string;
}) {
  const { data, isLoading } = useConversationMessages(conversationId);
  const send = useSendChatMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];
  const runs = useMemo(() => buildMessageRuns(items, me?.id), [items, me?.id]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1 bg-chat-zone">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {isLoading ? (
                <MessageGroup>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-2/3" />
                  ))}
                </MessageGroup>
              ) : items.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Empty>
                    <EmptyTitle>{emptyLabel}</EmptyTitle>
                  </Empty>
                </div>
              ) : (
                <MessageGroup className="gap-3">
                  {runs.map((run, runIndex) => {
                    const prevRun = runIndex === 0 ? undefined : runs[runIndex - 1];
                    const { first, last } = run;
                    return (
                      <Fragment key={first.id}>
                        {startsNewDay(prevRun?.last, first) ? (
                          <MessageScrollerItem>
                            <DayChip label={formatDayLabel(first.createdAt)} />
                          </MessageScrollerItem>
                        ) : null}
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {run.items.map((message) => (
                            <MessageScrollerItem key={message.id}>
                              <MessageMenu
                                message={message}
                                mine={run.mine}
                                conversationId={conversationId}
                              >
                                <ChatMessageItem
                                  message={message}
                                  mine={run.mine}
                                  showName={showAuthor && !run.mine && message.id === first.id}
                                  showAvatar={message.id === last.id}
                                  tail={message.id === last.id}
                                />
                              </MessageMenu>
                            </MessageScrollerItem>
                          ))}
                        </div>
                      </Fragment>
                    );
                  })}
                </MessageGroup>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      {/* key по conversationId: черновик композера НЕ переезжает в другую
          беседу при замене содержимого карточки (режим «Навигация» ветки) */}
      <ChatComposer
        key={conversationId}
        placeholder={composerPlaceholder}
        onSend={(text) => send.mutate({ text })}
        focusId={`conversation:${conversationId}`}
      />
    </div>
  );
}
