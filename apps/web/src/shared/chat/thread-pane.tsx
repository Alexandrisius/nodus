import { Fragment, memo, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { MessageGroup } from '@nodus/ui/components/message';
import { cn } from '@nodus/ui/lib/utils';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';

import { useAuthStore } from '../auth-store.js';
import { chatAttachmentsEnabled } from './attachments-gate.js';
import { useSendChatMessage, useThreadMessages } from './api.js';
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
import { selectionComposerProps, useFeedSelection } from './use-feed-selection.js';
import { ScrollEndResponder } from './scroll-end-responder.js';
import { JumpResponder } from './use-jump-responder.js';

/**
 * Тред канала (вердикт владельца): «провалиться внутрь — обычный чат».
 * Шапка — моно-метка «Обсуждение»; корневой пост отделён штриховой линией и
 * живёт собственной серией из одного сообщения (имя/аватар/хвостик — полный
 * набор); ответы — разговорная лента с сериями одного автора (план
 * docs/mvp/archive/chat-messages-plan.md). Композер отправляет с threadRootId.
 * Обвязка линии A (#87): селект с полосой, drop-зона, jump-резидент окна
 * треда (цитаты/закрепы-ответы), черновики/вложения per scope. Пин-бара в
 * окне треда НЕТ (v1: закрепы живут у ленты; в Telegram пины топиков свои —
 * заложено моделью threadRootId в jump/pin-контрактах).
 *
 * Два варианта шапки (окно треда, #42): 'drill' — тред ЗАМЕНИЛ ленту (узкая
 * зона, карточки): кнопка «К ленте»; 'side' — тред ПОЛНОВЫСОТНЫМ окном РАДОМ
 * с лентой (Slack-паттерн, вердикт владельца 15.09.2026).
 */
export const ThreadPane = memo(function ThreadPane({
  conversationId,
  threadRootId,
  variant = 'drill',
  barClass = 'h-12',
  onClose,
}: {
  conversationId: string;
  threadRootId: string;
  variant?: 'drill' | 'side';
  /** Высота бара треда = высота бара хоста (линии border-b продолжаются
   *  друг в друга — канон панели беседы, `headerClass`). */
  barClass?: string;
  onClose: () => void;
}) {
  const scope = `thread:${threadRootId}`;
  const { data, isLoading } = useThreadMessages(conversationId, threadRootId);
  const send = useSendChatMessage(conversationId);
  const edit = useEditMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];
  const root = items.find((m) => m.id === threadRootId);
  const replies = items.filter((m) => m.id !== threadRootId);
  const runs = useMemo(() => buildMessageRuns(replies, me?.id), [replies, me?.id]);
  const rootMine = root ? root.author.id === me?.id : false;
  const selection = useFeedSelection(scope, items, me?.id);
  // Viewport окна треда — цель прыжка (scroll-jump, вердикт 25.09).
  const viewportRef = useRef<HTMLDivElement>(null);

  const lastMine = useCallback(
    () =>
      [...items].reverse().find((m) => m.author.id === me?.id && !m.deletedAt && !m.forwardedFrom),
    [items, me?.id],
  );

  function handleSubmit(submit: ComposerSubmit) {
    if (submit.edit) {
      edit.mutate({ messageId: submit.edit.messageId, text: submit.text });
      return;
    }
    send.mutate({ ...toSendVars(submit), threadRootId });
  }

  function handleEditLast() {
    const message = lastMine();
    if (!message) return;
    useChatDrafts.getState().setEdit(scope, message);
    focusComposer(scope);
  }

  function renderMessage(
    message: (typeof items)[number],
    mine: boolean,
    firstId?: string,
    lastId?: string,
  ) {
    const isRoot = message.id === threadRootId;
    return (
      <MessageRow
        messageId={message.id}
        selectable={selection.selectionActive && !message.deletedAt}
        selected={selection.selectedSet.has(message.id)}
        onToggle={(shift) => selection.toggle(message.id, shift)}
      >
        {message.deletedAt ? (
          <ChatMessageItem message={message} mine={mine} />
        ) : (
          <MessageMenu
            message={message}
            mine={mine}
            conversationId={conversationId}
            scope={scope}
            messagesOfSelection={selection.getSelectedMessages}
          >
            <ChatMessageItem
              message={message}
              mine={mine}
              showName={isRoot ? !mine : !mine && message.id === firstId}
              showAvatar={isRoot ? true : message.id === lastId}
              tail={isRoot ? true : message.id === lastId}
            />
          </MessageMenu>
        )}
      </MessageRow>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header
        className={cn('flex shrink-0 items-center gap-2 border-b border-border px-3', barClass)}
      >
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
      <FeedDropzone
        className="flex min-h-0 flex-1 flex-col"
        disabled={!chatAttachmentsEnabled()}
        onFiles={(files) => addFiles(scope, files)}
      >
        <MessageScrollerProvider autoScroll>
          <ScrollEndResponder scope={scope} />
          <JumpResponder
            conversationId={conversationId}
            threadRootId={threadRootId}
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
                ) : (
                  <MessageGroup className="gap-3">
                    {root ? (
                      <MessageScrollerItem messageId={root.id}>
                        {renderMessage(root, rootMine)}
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
                              <MessageScrollerItem key={message.id} messageId={message.id}>
                                {renderMessage(message, run.mine, first.id, last.id)}
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
      <ChatComposer
        placeholder={ui.chat.replyPlaceholder}
        focusId={scope}
        conversationId={conversationId}
        attachmentsEnabled
        onEditLast={handleEditLast}
        selection={selectionComposerProps(conversationId, selection)}
        onSubmit={handleSubmit}
      />
    </div>
  );
});
