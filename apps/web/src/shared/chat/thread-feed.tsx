import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, Fragment } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../auth-store.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ChatComposer, type ComposerSubmit } from './chat-composer.js';
import { useChatPrefs } from './chat-prefs.js';
import { setOpenConversation } from './notifications.js';
import { useChatDrafts } from './chat-drafts.js';
import { ConversationViewsLine } from './views-line.js';
import { addFiles } from './composer-files.js';
import { toSendVars } from './composer-submit.js';
import { registerScopeSubmit } from './submit-registry.js';
import { focusComposer } from './composer-focus.js';
import { useScrollEndStore } from './scroll-end-store.js';
import { FeedDropzone } from './feed-dropzone.js';
import { useEditMessage } from './message-mutations.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { DayChip } from './day-chip.js';
import { MessageRunView } from './message-run.js';
import { PostCard } from './post-card.js';
import { PinBar } from './pin-bar.js';
import { useJumpResponder } from './use-jump-responder.js';
import { useFeedViewportRead } from './use-viewport-read.js';
import { selectionComposerProps, useFeedSelection } from './use-feed-selection.js';
import { useBoxSelection } from './use-box-selection.js';
import { useConversations, useThreadStates } from './api.js';
import { canPostFeed } from './conversations.js';
// >300 строк — обоснование (I5): лента постов канала — якорь низа, stick-логика
// роста, пагинация и селект-режим в одном компоненте; анатомия поста вынесена
// в post-card.tsx (карточка+надгробие), деление размывало бы поток ленты (#96).

/**
 * Лента канала (вердикт владельца 2026-09-10): каждое сообщение канала —
 * новость-тред. Корневые сообщения — плоские карточки-посты (не пузыри)
 * ОГРАНИЧЕННОЙ ширины (max-w-2xl, референс — каналы Битрикс24). Грамматика
 * поста (рефы владельца 14.09.2026): автор сверху; вложения ВЫШЕ текста;
 * реакции + мета (пин/«изменено»/время — ОБЩИЙ компонент с пузырём чата,
 * `message-meta.tsx`, #96) одной строкой внизу; ответы — отдельной тонированной
 * полосой с аватарами участников и счётчиком и входом «Обсудить».
 * Обвязка линии A (#87): пин-бар ленты (клик по закрепленному ответу треда
 * открывает окно), режим селекта постов, drop-зона файлов, DOM-jump к посту
 * (лента без MessageScroller — якоря data-message-id от MessageRow).
 * «Ответить» в меню поста = открыть тред (канон: ответы канала — треды).
 */
export const ThreadFeed = memo(function ThreadFeed({
  conversationId,
  onOpenThread,
}: {
  conversationId: string;
  onOpenThread: (rootId: string) => void;
}) {
  const scope = `feed:${conversationId}`;

  // Открытая беседа для гейта уведомлений (#124): фоновая вкладка
  // уведомляет о чужих сообщениях НЕОТКРЫТОЙ беседы.
  useEffect(() => {
    setOpenConversation(conversationId);
    return () => setOpenConversation(null);
  }, [conversationId]);
  const { data, isLoading } = useConversationMessages(conversationId);
  // Право публикации в ленту (I8 на клиенте — только UX; сервер проверяет
  // матрицу сам): без post композер ленты гасится, обсуждение — в тредах.
  const { data: conversationsData } = useConversations();
  const conversation = conversationsData?.items.find((c) => c.id === conversationId) ?? null;
  // Состояния трэдов текущего пользователя (раунд 3): точка «есть новые» на
  // счётчике ответов поста — только наблюдателям трэда.
  const { data: threadStates } = useThreadStates(conversationId);
  const send = useSendChatMessage(conversationId, scope);
  const edit = useEditMessage(conversationId, scope);
  const me = useAuthStore((s) => s.user);
  // «По обе стороны» (#151): свои посты каналов прижимаются вправо, как
  // пузыри чата; посты-карточки уважают ту же настройку, что и сообщения.
  const align = useChatPrefs((s) => s.align);
  const feedRef = useRef<HTMLDivElement>(null);

  const items = data?.items ?? [];
  const roots = useMemo(
    () => items.filter((m) => m.threadRootId === null && m.replyToId === null),
    [items],
  );
  // Лента канала — обычный div-скролл: stick к низу при новых постах (если
  // пользователь у нижнего края) и ВСЕГДА при своей отправке/пересылке сюда
  // (вердикт 24.09: своё сообщение видно с любой позиции скролла).
  // ОТКРЫТИЕ КАНАЛА — сразу ВНИЗ (раунд 4): иначе лента оставалась на верху —
  // ни последнего поста целиком, ни pill просмотров не видно (вердикт
  // владельца); прежде баг маскировал pill-оверлей у низа экрана.
  const scrollRequest = useScrollEndStore((s) => s.requests[scope]);
  const scrollPrev = useRef({ count: 0, nonce: 0 });
  /** Форс-запрос «залипает» до ИСПОЛНЕНИЯ ростом ленты (пачка C, репро
   *  владельца 29.09: свой пост не докручивал ленту). Запрос приходит в
   *  момент сабмита — ДО прихода поста: мгновенный скролл уходит к СТАРОМУ
   *  низу, а когда пост приезжает, nearBottom уже false (высота поста > 80px)
   *  и догон не срабатывает. Теперь форс держится, пока posts не станет
   *  больше, чем на момент запроса (страховочный таймаут — на случай
   *  отправки, упавшей на сервере). */
  const forcedUntilGrew = useRef<{ count: number; timer: number } | null>(null);
  const openedAtBottom = useRef(false);
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (openedAtBottom.current || isLoading || roots.length === 0 || !el) return;
    openedAtBottom.current = true;
    el.scrollTop = el.scrollHeight;
  }, [isLoading, roots.length]);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const nonce = scrollRequest?.nonce ?? 0;
    if (nonce !== scrollPrev.current.nonce) {
      if (forcedUntilGrew.current !== null) {
        window.clearTimeout(forcedUntilGrew.current.timer);
      }
      const timer = window.setTimeout(() => {
        forcedUntilGrew.current = null;
      }, 5_000);
      forcedUntilGrew.current = { count: roots.length, timer };
    }
    const grew = roots.length > scrollPrev.current.count;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const forced = forcedUntilGrew.current !== null;
    scrollPrev.current = { count: roots.length, nonce };
    if (forced || (grew && nearBottom)) {
      // Исполнение форса: лента выросла относительно момента запроса.
      if (forcedUntilGrew.current && roots.length > forcedUntilGrew.current.count) {
        window.clearTimeout(forcedUntilGrew.current.timer);
        forcedUntilGrew.current = null;
      }
      el.scrollTo({
        top: el.scrollHeight,
        behavior: forced ? (scrollRequest?.behavior ?? 'smooth') : 'auto',
      });
    }
  }, [roots.length, scrollRequest]);
  const repliesByRoot = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const message of items) {
      if (!message.threadRootId) continue;
      const list = map.get(message.threadRootId) ?? [];
      list.push(message);
      map.set(message.threadRootId, list);
    }
    return map;
  }, [items]);

  const selection = useFeedSelection(scope, roots, me?.id);
  // Рамочное выделение (#132 р.6 — модель Telegram webk, та же логика,
  // что сообщения чатов, вердикт «не разделять»); якорь — скролл-контейнер
  // постов.
  const box = useBoxSelection({
    scope,
    viewportRef: feedRef,
    selectableIds: selection.orderedIds,
    selectionActive: selection.selectionActive,
  });
  useJumpResponder({
    conversationId,
    threadRootId: null,
    itemCount: roots.length,
    containerRef: feedRef,
  });
  // Квитанции просмотров (#102 р.2): лента канала — plain div без скроллера-
  // примитива, свой IntersectionObserver по постам (root=скроллер).
  useFeedViewportRead(conversationId, feedRef, roots);

  const lastMine = useCallback(
    () =>
      [...roots].reverse().find((m) => m.author.id === me?.id && !m.deletedAt && !m.forwardedFrom),
    [roots, me?.id],
  );

  function handleSubmit(submit: ComposerSubmit) {
    if (submit.edit) {
      edit.mutate({ messageId: submit.edit.messageId, text: submit.text });
      return;
    }
    send.mutate(toSendVars(submit));
  }

  // Окно отправки вложений (#144): глобальный диалог шлёт через хук хоста —
  // оптимистичность/reply/идемпотентность в одном месте; send — новый объект
  // каждый рендер, реестру нужен стабильный колбэк: ref.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () => registerScopeSubmit(scope, (submit) => sendRef.current.mutateAsync(toSendVars(submit))),
    [scope],
  );

  function handleEditLast() {
    const message = lastMine();
    if (!message) return;
    useChatDrafts.getState().setEdit(scope, message);
    focusComposer(scope);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Пин-бар НА МЕСТЕ и в селекте: батч-команды — узкий островок
          композера (вердикт 24.09 — верх ленты не двигается). */}
      <PinBar conversationId={conversationId} onOpenThread={onOpenThread} />
      <FeedDropzone
        className="relative flex min-h-0 flex-1 flex-col"
        onFiles={(files) => addFiles(scope, files)}
      >
        <div
          ref={feedRef}
          className={cn(
            // Р.11: гуттер скроллбара РЕЗЕРВИРУЕТСЯ ВСЕГДА (канон
            // MessageScrollerViewport: scrollbar-thin + gutter-stable) —
            // при сужении ленты открытием окна трэда контент переступал
            // порог переполнения, классический скроллбар появлялся на кадр
            // и съедал ~ширину рывком («лента дёргается влево на 1мм»).
            'min-h-0 flex-1 overflow-y-auto bg-chat-zone px-4 pt-4 pb-0 scrollbar-thin scrollbar-gutter-stable',
            (selection.selectionActive || box.active) && 'select-none',
          )}
        >
          {/* Р.12: скелетоны-полоски убраны (три широкие полосы на первое
              открытие после перезагрузки читались артефактом); лента
              загрузки — пустая, контент проявляется feed-reveal. */}
          {isLoading ? null : roots.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty>
                <EmptyTitle>{ui.chat.feedEmpty}</EmptyTitle>
              </Empty>
            </div>
          ) : (
            <div className="feed-reveal flex h-max min-h-full flex-col justify-end gap-3">
              {/* Р.7: лента ЯКОРИТСЯ НИЗОМ (модель Telegram: переписка растёт
                  снизу вверх — первый пост внизу, пустоты под контентом не
                  бывает): неполный экран — контент прижат к низу, pill
                  «Просмотрено» всегда у нижней кромки статично; полный —
                  h-max растёт вверх, якорь не мешает скроллу. */}
              {/* Посты — СЕРИЯМИ одного автора/дня (вердикт владельца
                  30.09, #164: как в чатах — один аватар на серию, липкий;
                  имя — у первого поста). Полоса обсуждения — у КАЖДОГО
                  поста со СВОИМИ данными (ответы/счётчик — per-message,
                  а не по первому посту серии: баг-вердикт 30.09 — ответ
                  на второй пост серии показывал счётчик первого); дата-
                  чип при смене дня — сепаратор разрыва серии. */}
              {buildMessageRuns(roots, me?.id).map((run, runIndex, runs) => {
                const prevRun = runIndex === 0 ? undefined : runs[runIndex - 1];
                // «По обе стороны» (#151): своя серия прижимается вправо,
                // аватар зеркалится справа (MessageRunView), карточки — у
                // правого края; ширина карточки (max-w-2xl) сохраняется.
                const atEnd = run.mine && align === 'both';
                return (
                  <Fragment key={run.first.id}>
                    {startsNewDay(prevRun?.last, run.first) ? (
                      <DayChip label={formatDayLabel(run.first.createdAt)} />
                    ) : null}
                    <MessageRunView
                      run={run}
                      showName={false}
                      renderItem={(message, attrs) => {
                        // Полоса поста — ДАННЫЕ ЭТОГО поста (треда): счётчик,
                        // участники, точка «есть новые» — per-message.
                        const replies = repliesByRoot.get(message.id) ?? [];
                        const repliesCount = message.threadRepliesCount || replies.length;
                        const participants = [
                          ...new Map(replies.map((r) => [r.author.id, r.author])).values(),
                        ];
                        const last = replies[replies.length - 1];
                        const threadUnread = Boolean(threadStates?.get(message.id)?.unreadCount);
                        return (
                          <div
                            style={attrs.style}
                            className={cn(
                              'flex w-full min-w-0',
                              atEnd ? 'justify-end' : 'justify-start',
                            )}
                          >
                            <MessageRow
                              messageId={message.id}
                              selectable={selection.selectionActive && !message.deletedAt}
                              selected={selection.selectedSet.has(message.id)}
                              onToggle={(shift) => selection.toggle(message.id, shift)}
                            >
                              {message.deletedAt ? (
                                <PostCard
                                  message={message}
                                  mine={run.mine}
                                  atEnd={atEnd}
                                  showName
                                  repliesCount={repliesCount}
                                  participants={participants}
                                  lastReplyAt={last?.createdAt ?? null}
                                  threadUnread={threadUnread}
                                  reactionsHidden
                                  onOpenThread={() => onOpenThread(message.id)}
                                />
                              ) : (
                                <MessageMenu
                                  message={message}
                                  mine={run.mine}
                                  conversationId={conversationId}
                                  scope={scope}
                                  replyMode="thread"
                                  onOpenThread={onOpenThread}
                                  messagesOfSelection={selection.getSelectedMessages}
                                >
                                  <PostCard
                                    message={message}
                                    mine={run.mine}
                                    atEnd={atEnd}
                                    showName={message.id === run.first.id}
                                    repliesCount={repliesCount}
                                    participants={participants}
                                    lastReplyAt={last?.createdAt ?? null}
                                    threadUnread={threadUnread}
                                    reactionsHidden={selection.selectionActive}
                                    onOpenThread={() => onOpenThread(message.id)}
                                  />
                                </MessageMenu>
                              )}
                            </MessageRow>
                          </div>
                        );
                      }}
                    />
                  </Fragment>
                );
              })}
              {/* Метка просмотров — ВСЕГДА последний элемент ленты постов
                  (модель Битрикс24); текст фильтруется от автора нижнего
                  поста (views-line); зазор сверху = 1.5× нижнего (#132 р.2). */}
              {/* Пилюля просмотров — ВСЕГДА СЛЕВА (вердикт владельца 29.09:
                  не выравнивается по сторонам даже в «По обе стороны»). */}
              <ConversationViewsLine
                conversationId={conversationId}
                messages={roots}
                className="-mt-[3px]"
              />
            </div>
          )}
        </div>
      </FeedDropzone>
      {/* Композер ленты ВСЕГДА смонтирован (р.8): с правами — полный ввод,
          без прав — строка-заглушка ВНУТРИ островка (disabledPlaceholder) —
          выход из мультиселекта морфится в заглушку той же анимацией, а не
          мгновенной подменой; в селекте — узкий батч-островок (р.6). Гейт
          «нет права post» — только UX (I8: сервер проверяет матрицу сам). */}
      <ChatComposer
        placeholder={ui.chat.newPostPlaceholder}
        focusId={scope}
        conversationId={conversationId}
        attachmentsEnabled
        onEditLast={handleEditLast}
        selection={selectionComposerProps(conversationId, selection)}
        disabledPlaceholder={
          conversation !== null && !canPostFeed(conversation) ? ui.chat.composerNoPostRights : null
        }
        onSubmit={handleSubmit}
      />
    </div>
  );
});
