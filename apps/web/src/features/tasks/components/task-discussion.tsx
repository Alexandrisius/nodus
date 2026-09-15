import { Fragment, memo, useMemo } from 'react';
import { ui } from '@nodus/contracts';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../../../shared/auth-store.js';
import { ChatComposer } from '../../../shared/chat/chat-composer.js';
import { ChatMessageItem } from '../../../shared/chat/chat-message.js';
import { DayChip } from '../../../shared/chat/day-chip.js';
import {
  buildMessageRuns,
  formatDayLabel,
  startsNewDay,
} from '../../../shared/chat/message-groups.js';
import { useSendTaskMessage, useTaskMessages } from '../api/tasks-api.js';

/**
 * Обсуждение задачи — центр карточки: ТА ЖЕ анатомия чата, что в мессенджере
 * (вердикт владельца 14.09.2026: «все чаты в едином стиле»): серии одного
 * автора (имя — чужое и только первое, аватар и хвостик — у последнего),
 * дата-чипы при смене дня, зона bg-chat-zone, MessageScroller с кнопкой
 * «вниз» и общий композер (скрепка/смайл/микрофон, вечный курсор, Enter —
 * отправить). Контракт сообщений — общий ChatMessage.
 */
export const TaskDiscussion = memo(function TaskDiscussion({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTaskMessages(taskId);
  const send = useSendTaskMessage(taskId);
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
                    <EmptyTitle>{ui.tasks.discussionEmpty}</EmptyTitle>
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
                              <ChatMessageItem
                                message={message}
                                mine={run.mine}
                                showName={!run.mine && message.id === first.id}
                                showAvatar={message.id === last.id}
                                tail={message.id === last.id}
                              />
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
      {/* В покое высота h-16 = высоте бара действий слева: верхние линии обоих
          баров — одна горизонталь через границу зон (вердикт владельца);
          при росте текста композер расширяется вверх, как в мессенджере. */}
      <ChatComposer
        key={taskId}
        placeholder={ui.tasks.addComment}
        onSend={(text) => send.mutate(text)}
        focusId={`task:${taskId}`}
      />
    </div>
  );
});
