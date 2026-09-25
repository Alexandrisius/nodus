import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';
import { Skeleton } from '@nodus/ui/components/skeleton';
import type { ConversationListItem } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../auth-store.js';
import { chatAttachmentsEnabled } from './attachments-gate.js';
import { useConversationMessages, useConversations, useSendChatMessage } from './api.js';
import { ChatComposer, type ComposerSubmit } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { useChatDrafts } from './chat-drafts.js';
import { addFiles } from './composer-files.js';
import { toSendVars } from './composer-submit.js';
import { focusComposer } from './composer-focus.js';
import { DayChip } from './day-chip.js';
import { FeedDropzone } from './feed-dropzone.js';
import { FeedScrollerButton } from './feed-scroller-button.js';
import { useEditMessage } from './message-mutations.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { decideOpenAnchor } from './open-anchor.js';
import { PinBar } from './pin-bar.js';
import { ScrollEndResponder } from './scroll-end-responder.js';
import { useFeedViewportRead } from './use-viewport-read.js';
import { ConversationViewsLine } from './views-line.js';
import { UnreadAnchor } from './use-unread-anchor.js';
import { selectionComposerProps, useFeedSelection } from './use-feed-selection.js';
import { JumpResponder } from './use-jump-responder.js';
import { useJumpStore } from './jump-store.js';

/**
 * Обычная беседа (групповой/личный чат, чаты задачи и письма): лента на
 * MessageScroller + композер. Серии одного автора (message-groups), дата-чипы,
 * контекстное меню по правому клику (MessageMenu). Обвязка линии A (#87):
 * сверху — полоса селекта (активен) или лента закрепов (пин-бар); drop-зона
 * файлов на ленте; jump-резидент (цитаты/закрепы/«Переслано от»); черновики
 * и вложения композера — в drafts-сторе per scope.
 *
 * Раунд 3: тело КЕИТСЯ по conversationId (свежий MessageScroller на каждую
 * беседу — до этого переключение сохраняло позицию прокрутки прошлой) и
 * открывается НА ПЕРВОМ НЕПРОЧИТАННОМ (UnreadAnchor + разделитель «Непрочитанные
 * сообщения», модель Telegram); авто-догон включается только когда
 * пользователь сам у низа (модальный autoScroll примитива).
 *
 * Раунд 4: решение об якоре — АСИНХРОННО-НАДЁЖНОЕ. Раньше unreadCount читался
 * на маунте из списка бесед, а при холодном deep-link список ещё не загружен
 * (conversation=undefined → якоря нет) — лента открывалась в конец, и
 * авто-догон «прочитывал» весь хвост. Теперь тело ленты гейтится готовностью
 * списка (обычно мгновенно из кэша; холодный вход — первый запрос, максимум
 * 1.5 c таймаута), и решение принимает decideOpenAnchor уже по данным.
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
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Пин-бар остаётся НА МЕСТЕ и в селекте: батч-команды живёт в узком
          островке композера (вердикт 24.09 — верх ленты не двигается). */}
      <PinBar conversationId={conversationId} />
      <ConversationBody
        key={conversationId}
        conversationId={conversationId}
        showAuthor={showAuthor}
        composerPlaceholder={composerPlaceholder}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

/** Предел ожидания списка бесед (страховка зависшего запроса): дольше —
 *  обычное открытие без якоря (деградация раунда 3), лента не висит. */
const LIST_GATE_TIMEOUT_MS = 1500;

/** Лента беседы: гейт готовности списка → тело (кеится по conversationId). */
function ConversationBody({
  conversationId,
  showAuthor,
  composerPlaceholder,
  emptyLabel,
}: {
  conversationId: string;
  showAuthor: boolean;
  composerPlaceholder: string;
  emptyLabel: string;
}) {
  const listQuery = useConversations();
  const conversation = listQuery.data?.items.find((c) => c.id === conversationId) ?? null;

  // Гейт открытия (раунд 4): решение об якоре требует myLastReadSeq — до
  // разрешения списка лента стоит на скелетоне и НЕ открывается в низ.
  const [gateTimedOut, setGateTimedOut] = useState(false);
  const gatePending = listQuery.data === undefined && !listQuery.isError && !gateTimedOut;
  useEffect(() => {
    if (!gatePending) return;
    const t = window.setTimeout(() => setGateTimedOut(true), LIST_GATE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [gatePending]);

  if (gatePending) {
    return <FeedSkeleton />;
  }
  return (
    <ConversationFeed
      conversationId={conversationId}
      conversation={conversation}
      showAuthor={showAuthor}
      composerPlaceholder={composerPlaceholder}
      emptyLabel={emptyLabel}
    />
  );
}

function FeedSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-chat-zone p-4" aria-hidden>
      <MessageGroup>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-2/3" />
        ))}
      </MessageGroup>
    </div>
  );
}

/** Тело ленты: монтируется ТОЛЬКО по готовому списку бесед — решение об
 *  якоре (decideOpenAnchor) принимается один раз на маунте по данным. */
function ConversationFeed({
  conversationId,
  conversation,
  showAuthor,
  composerPlaceholder,
  emptyLabel,
}: {
  conversationId: string;
  conversation: ConversationListItem | null;
  showAuthor: boolean;
  composerPlaceholder: string;
  emptyLabel: string;
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
  // Квитанции просмотров (#102 р.2): seq самой новой видимой строки ленты —
  // IO по строкам, root=скроллер (механика — use-viewport-read.ts).
  useFeedViewportRead(conversationId, viewportRef, items);

  // Якорь открытия (раунд 4): jump-запрос побеждает непрочитанных, иначе
  // unreadCount > 0 → якорь на первом непрочитанном; решение — на маунте.
  const [open] = useState(() =>
    decideOpenAnchor(conversationId, conversation, {
      jumpTarget: useJumpStore.getState().target,
    }),
  );
  // Пока якорь не встал — авто-догон выключен (иначе примитив дёрнул бы
  // ленту в конец на первых данных). Снимается двойным rAF после якоря —
  // после MutationObserver-прохода примитива; дальше модальный autoScroll:
  // догон включается только фактом «пользователь у низа».
  const [anchoring, setAnchoring] = useState(open.anchoring);
  const releaseAnchor = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnchoring(false)));
  }, []);

  // Разделитель непрочитанных: НАД первым непрочитанным (даже внутри серии);
  // ЖИВОЙ по watermark: прочитал всё — исчезает сразу (вердикт раунда 4),
  // по мере чтения спускается к оставшемуся хвосту (модель Telegram).
  const myLastReadSeq = conversation?.myLastReadSeq ?? null;
  const firstUnreadId = useMemo(() => {
    if (myLastReadSeq === null || (conversation?.unreadCount ?? 0) === 0) return null;
    return items.find((m) => m.seq > myLastReadSeq && !m.deletedAt)?.id ?? null;
  }, [items, myLastReadSeq, conversation?.unreadCount]);

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
    send.mutate(toSendVars(submit));
  }

  function handleEditLast() {
    const message = lastMine();
    if (!message) return;
    useChatDrafts.getState().setEdit(scope, message);
    focusComposer(scope);
  }

  return (
    <>
      <FeedDropzone
        className="relative flex min-h-0 flex-1 flex-col"
        disabled={!chatAttachmentsEnabled()}
        onFiles={(files) => addFiles(scope, files)}
      >
        <MessageScrollerProvider autoScroll={!anchoring}>
          <UnreadAnchor
            items={items}
            isLoading={isLoading}
            anchorSeq={anchoring && open.jump === null ? myLastReadSeq : null}
            jump={anchoring ? open.jump : null}
            viewportRef={viewportRef}
            onAnchored={releaseAnchor}
          />
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
                className={cn('px-4 pt-4 pb-0', selection.selectionActive && 'select-none')}
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
                              <Fragment key={message.id}>
                                {/* Разделитель непрочитанных — строго НАД первым
                                    непрочитанным сообщением, даже ВНУТРИ серии
                                    (спека раунда 4: якорь по REST-филлу одного
                                    автора оставлял чип над всей серией, за
                                    сгибом); my-[5px] держит ритм 12px (gap-3). */}
                                {firstUnreadId === message.id ? (
                                  <MessageScrollerItem>
                                    <div className="my-[5px]">
                                      <DayChip label={ui.chat.unreadDivider} />
                                    </div>
                                  </MessageScrollerItem>
                                ) : null}
                                <MessageScrollerItem messageId={message.id}>
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
                              </Fragment>
                            ))}
                          </div>
                        </Fragment>
                      );
                    })}
                    {/* Метка просмотров — ВСЕГДА последний элемент ленты
                        (модель Битрикс24); текст фильтруется от автора
                        нижнего сообщения (views-line). */}
                    <ConversationViewsLine
                      conversationId={conversationId}
                      messages={items}
                      className="-mt-2"
                    />
                  </MessageGroup>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            {/* Стрелка «вниз»: с непрочитанными — к первому непрочитанному
                (модель Telegram, раунд 4), без — в конец. */}
            <FeedScrollerButton firstUnreadId={firstUnreadId} viewportRef={viewportRef} />
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
    </>
  );
}
