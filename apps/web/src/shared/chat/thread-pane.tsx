import { Fragment, memo, useMemo } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { MessageGroup } from '@nodus/ui/components/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';

import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { DayChip } from './day-chip.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { MessageMenu } from './message-menu.js';
import { useSendChatMessage, useThreadMessages } from './api.js';

/**
 * Тред канала (вердикт владельца): «провалиться внутрь — обычный чат».
 * Шапка — моно-метка «Обсуждение»; корневой пост отделён штриховой линией и
 * живёт собственной серией из одного сообщения (имя/аватар/хвостик — полный
 * набор); ответы — разговорная лента с сериями одного автора (план
 * docs/mvp/chat-messages-plan.md): имя только чужое и только у первого
 * сообщения серии, аватар и хвостик у последнего, дата-чипы при смене дня.
 * Композер отправляет с threadRootId (уведомления — только участники треда и
 * наблюдатели проекта, бэкенд-механика M13). Правая панель беседы — у
 * контейнера (шапка беседы), не у пейна.
 *
 * Два варианта шапки (окно треда, #42): 'drill' — тред ЗАМЕНИЛ ленту (узкая
 * зона, карточки): кнопка «К ленте»; 'side' — тред окном РАДОМ с лентой
 * (Slack-паттерн): крестик закрытия, лента остаётся видимой.
 */
export const ThreadPane = memo(function ThreadPane({
  conversationId,
  threadRootId,
  variant = 'drill',
  onClose,
}: {
  conversationId: string;
  threadRootId: string;
  variant?: 'drill' | 'side';
  onClose: () => void;
}) {
  const { data, isLoading } = useThreadMessages(conversationId, threadRootId);
  const send = useSendChatMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];
  const root = items.find((m) => m.id === threadRootId);
  const replies = items.filter((m) => m.id !== threadRootId);
  const runs = useMemo(() => buildMessageRuns(replies, me?.id), [replies, me?.id]);
  const rootMine = root ? root.author.id === me?.id : false;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {variant === 'drill' ? (
          <Button variant="ghost" size="icon" aria-label={ui.chat.backToFeed} onClick={onClose}>
            <ArrowLeft />
          </Button>
        ) : null}
        <NodeLabel label={ui.chat.discussion} count={replies.length} />
        {variant === 'side' ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto hover:bg-accent"
            aria-label={ui.common.close}
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </header>
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
              ) : (
                <MessageGroup className="gap-3">
                  {root ? (
                    <MessageScrollerItem>
                      <MessageMenu message={root} mine={rootMine} conversationId={conversationId}>
                        <ChatMessageItem
                          message={root}
                          mine={rootMine}
                          showName={!rootMine}
                          showAvatar
                          tail
                        />
                      </MessageMenu>
                      <span
                        aria-hidden
                        className="mt-3 block border-b border-dashed border-border"
                      />
                    </MessageScrollerItem>
                  ) : null}
                  {runs.map((run, runIndex) => {
                    const prevLast = runIndex === 0 ? root : runs[runIndex - 1]?.last;
                    const { first, last } = run;
                    return (
                      <Fragment key={first.id}>
                        {startsNewDay(prevLast, first) ? (
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
                                  showName={!run.mine && message.id === first.id}
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
      <ChatComposer
        placeholder={ui.chat.replyPlaceholder}
        onSend={(text) => send.mutate({ text, threadRootId })}
      />
    </div>
  );
});
