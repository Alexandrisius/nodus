import { Fragment, useCallback, useMemo, useRef } from 'react';
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
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../auth-store.js';
import { chatAttachmentsEnabled } from './attachments-gate.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ChatComposer, type ComposerSubmit } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { useChatDrafts } from './chat-drafts.js';
import { addFiles } from './composer-files.js';
import { toSendVars } from './composer-submit.js';
import { focusComposer } from './composer-focus.js';
import { DayChip } from './day-chip.js';
import { FeedDropzone } from './feed-dropzone.js';
import { useEditMessage } from './message-mutations.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { PinBar } from './pin-bar.js';
import { ScrollEndResponder } from './scroll-end-responder.js';
import { selectionComposerProps, useFeedSelection } from './use-feed-selection.js';
import { JumpResponder } from './use-jump-responder.js';

/**
 * Обычная беседа (групповой/личный чат, чаты задачи и письма): лента на
 * MessageScroller + композер. Серии одного автора (message-groups), дата-чипы,
 * контекстное меню по правому клику (MessageMenu). Обвязка линии A (#87):
 * сверху — полоса селекта (активен) или лента закрепов (пин-бар); drop-зона
 * файлов на ленте; jump-резидент (цитаты/закрепы/«Переслано от»); черновики
 * и вложения композера — в drafts-сторе per scope.
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
  const scope = `conversation:${conversationId}`;
  const { data, isLoading } = useConversationMessages(conversationId);
  const send = useSendChatMessage(conversationId);
  const edit = useEditMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];
  const runs = useMemo(() => buildMessageRuns(items, me?.id), [items, me?.id]);
  const selection = useFeedSelection(scope, items, me?.id);
  // Viewport ленты — цель прыжка (scroll-jump): «видно/не видно» и скролл
  // ВНУТРИ контейнера без отрыва низа (вердикт 25.09).
  const viewportRef = useRef<HTMLDivElement>(null);

  const lastMine = useCallback(
    () => [...items].reverse().find((m) => m.author.id === me?.id && !m.deletedAt),
    [items, me?.id],
  );

  function handleSubmit(submit: ComposerSubmit) {
    if (submit.edit) {
      edit.mutate({ messageId: submit.edit.messageId, text: submit.text });
      return;
    }
    send.mutate(toSendVars(submit));
  }

  function handleEditLast() {
    const message = lastMine();
    if (!message) return;
    useChatDrafts.getState().setEdit(scope, message);
    focusComposer(scope);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Пин-бар остаётся НА МЕСТЕ и в селекте: батч-команды живёт в узком
          островке композера (вердикт 24.09 — верх ленты не двигается). */}
      <PinBar conversationId={conversationId} />
      <FeedDropzone
        className="flex min-h-0 flex-1 flex-col"
        disabled={!chatAttachmentsEnabled()}
        onFiles={(files) => addFiles(scope, files)}
      >
        <MessageScrollerProvider autoScroll>
          <ScrollEndResponder scope={scope} />
          <JumpResponder
            conversationId={conversationId}
            threadRootId={null}
            itemCount={items.length}
            containerRef={viewportRef}
          />
          <MessageScroller className="min-h-0 flex-1 bg-chat-zone">
            <MessageScrollerViewport ref={viewportRef}>
              <MessageScrollerContent
                className={cn('p-4', selection.selectionActive && 'select-none')}
              >
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
                              <MessageScrollerItem key={message.id} messageId={message.id}>
                                <MessageRow
                                  messageId={message.id}
                                  selectable={selection.selectionActive && !message.deletedAt}
                                  selected={selection.selectedSet.has(message.id)}
                                  onToggle={(shift) => selection.toggle(message.id, shift)}
                                >
                                  {message.deletedAt ? (
                                    <ChatMessageItem message={message} mine={run.mine} />
                                  ) : (
                                    <MessageMenu
                                      message={message}
                                      mine={run.mine}
                                      conversationId={conversationId}
                                      scope={scope}
                                      messagesOfSelection={selection.getSelectedMessages}
                                    >
                                      <ChatMessageItem
                                        message={message}
                                        mine={run.mine}
                                        showName={
                                          showAuthor && !run.mine && message.id === first.id
                                        }
                                        showAvatar={message.id === last.id}
                                        tail={message.id === last.id}
                                      />
                                    </MessageMenu>
                                  )}
                                </MessageRow>
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
      </FeedDropzone>
      {/* key по conversationId: автофокус композера при входе/смене беседы
          (черновик при этом живёт в stores — не теряется, #87). */}
      <ChatComposer
        key={conversationId}
        placeholder={composerPlaceholder}
        focusId={scope}
        conversationId={conversationId}
        attachmentsEnabled
        onEditLast={handleEditLast}
        selection={selectionComposerProps(conversationId, selection)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
