import { ArrowRight } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../auth-store.js';
import { formatTime, plural } from '../lib/format.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ChatComposer, type ComposerSubmit } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { useChatDrafts } from './chat-drafts.js';
import { MessageAttachments } from './attachments.js';
import { MessageReactions } from './chat-message.js';
import { MessageMeta } from './message-meta.js';
import { addFiles } from './composer-files.js';
import { toSendVars } from './composer-submit.js';
import { focusComposer } from './composer-focus.js';
import { useScrollEndStore } from './scroll-end-store.js';
import { FeedDropzone } from './feed-dropzone.js';
import { useEditMessage } from './message-mutations.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';
import { PinBar } from './pin-bar.js';
import { useDomJumpResponder } from './use-dom-jump.js';
import { selectionComposerProps, useFeedSelection } from './use-feed-selection.js';
import { useConversations } from './api.js';
import { canPostFeed } from './conversations.js';

function repliesLabel(count: number): string {
  return `${count} ${plural(count, [ui.chat.repliesOne, ui.chat.repliesFew, ui.chat.repliesMany])}`;
}

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
  const { data, isLoading } = useConversationMessages(conversationId);
  // Право публикации в ленту (I8 на клиенте — только UX; сервер проверяет
  // матрицу сам): без post композер ленты гасится, обсуждение — в тредах.
  const { data: conversationsData } = useConversations();
  const conversation = conversationsData?.items.find((c) => c.id === conversationId) ?? null;
  const send = useSendChatMessage(conversationId);
  const edit = useEditMessage(conversationId);
  const me = useAuthStore((s) => s.user);
  const feedRef = useRef<HTMLDivElement>(null);

  const items = data?.items ?? [];
  const roots = useMemo(
    () => items.filter((m) => m.threadRootId === null && m.replyToId === null),
    [items],
  );
  // Лента канала — обычный div-скролл: stick к низу при новых постах (если
  // пользователь у нижнего края) и ВСЕГДА при своей отправке/пересылке сюда
  // (вердикт 24.09: своё сообщение видно с любой позиции скролла).
  const scrollNonce = useScrollEndStore((s) => s.nonces[scope] ?? 0);
  const scrollPrev = useRef({ count: 0, nonce: 0 });
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const forced = scrollNonce !== scrollPrev.current.nonce;
    const grew = roots.length > scrollPrev.current.count;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    scrollPrev.current = { count: roots.length, nonce: scrollNonce };
    if (forced || (grew && nearBottom)) {
      el.scrollTo({ top: el.scrollHeight, behavior: forced ? 'smooth' : 'auto' });
    }
  }, [roots.length, scrollNonce]);
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
  useDomJumpResponder(feedRef, {
    conversationId,
    threadRootId: null,
    itemCount: roots.length,
  });

  const lastMine = useCallback(
    () => [...roots].reverse().find((m) => m.author.id === me?.id && !m.deletedAt),
    [roots, me?.id],
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
      {/* Пин-бар НА МЕСТЕ и в селекте: батч-команды — узкий островок
          композера (вердикт 24.09 — верх ленты не двигается). */}
      <PinBar conversationId={conversationId} onOpenThread={onOpenThread} />
      <FeedDropzone
        className="flex min-h-0 flex-1 flex-col"
        onFiles={(files) => addFiles(scope, files)}
      >
        <div
          ref={feedRef}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto bg-chat-zone p-4',
            selection.selectionActive && 'select-none',
          )}
        >
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : roots.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty>
                <EmptyTitle>{ui.chat.feedEmpty}</EmptyTitle>
              </Empty>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {roots.map((root) => {
                const replies = repliesByRoot.get(root.id) ?? [];
                const repliesCount = root.threadRepliesCount || replies.length;
                const participants = [
                  ...new Map(replies.map((r) => [r.author.id, r.author])).values(),
                ];
                const last = replies[replies.length - 1];
                return (
                  <MessageRow
                    key={root.id}
                    messageId={root.id}
                    selectable={selection.selectionActive && !root.deletedAt}
                    selected={selection.selectedSet.has(root.id)}
                    onToggle={(shift) => selection.toggle(root.id, shift)}
                  >
                    {root.deletedAt ? (
                      <ChatMessageItem message={root} mine={root.author.id === me?.id} />
                    ) : (
                      <MessageMenu
                        message={root}
                        mine={root.author.id === me?.id}
                        conversationId={conversationId}
                        scope={scope}
                        replyMode="thread"
                        onOpenThread={onOpenThread}
                        messagesOfSelection={selection.getSelectedMessages}
                      >
                        {/* Пост — НЕ <button>: внутри живут интерактивы (плитки
                            галереи, реакции, чипы файлов) — вложенные кнопки
                            невалидны (hydration-ошибка, аудит #45). Кликабельная
                            карточка: div+role с клавиатурой; клики по вложенным
                            контролам отсекаются гардой; в режиме селекта клик
                            переключает отметку (MessageRow, capture). */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            const interactive = (e.target as HTMLElement).closest(
                              'button, a, input, [role="button"]',
                            );
                            if (interactive && interactive !== e.currentTarget) return;
                            onOpenThread(root.id);
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.target === e.currentTarget &&
                              (e.key === 'Enter' || e.key === ' ')
                            ) {
                              e.preventDefault();
                              onOpenThread(root.id);
                            }
                          }}
                          className="node-panel w-full max-w-2xl cursor-pointer p-3.5 text-left transition-colors hover:border-input"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <PersonAvatar
                              name={root.author.displayName}
                              className="size-7 shrink-0"
                            />
                            <span className="min-w-0 truncate font-medium">
                              {root.author.displayName}
                            </span>
                          </span>
                          {root.attachments.length > 0 ? (
                            <span className="mt-2 block">
                              <MessageAttachments message={root} />
                            </span>
                          ) : null}
                          <span className="mt-2 block text-sm leading-relaxed whitespace-pre-wrap">
                            {root.text}
                          </span>
                          {/* Мета поста — ТА ЖЕ композиция и те же зазоры, что в
                              пузыре чата (#96, message-meta.tsx): пин →
                              «изменено» → время, микро-кегль 10px, плотный
                              зазор над строкой (3px — как шаг стека пузыря,
                              вердикт владельца 24.09.2026: время постов должно
                              читаться как в сообщениях чатов). До #96 пост
                              рисовал только время — закреп и правка на карточке
                              терялись (в окне треда тот же корень рендерится
                              пузырём с полной метой — рассинхрон). Галочек
                              прочтения на постах НЕТ (семантика прочтения
                              каналов — отдельная тема, #96 «не входит»). */}
                          <span className="mt-[3px] flex items-end gap-2">
                            <MessageReactions message={root} />
                            <MessageMeta message={root} className="ml-auto" />
                          </span>
                          <span className="-mx-3.5 -mb-3.5 mt-[6px] flex items-center gap-2 rounded-b-[0.8125rem] border-t border-border/60 bg-muted/40 px-3.5 py-2">
                            {participants.length > 0 ? (
                              <span className="flex shrink-0 -space-x-1.5">
                                {participants.slice(0, 3).map((p) => (
                                  <PersonAvatar
                                    key={p.id}
                                    name={p.displayName}
                                    className="size-5 ring-2 ring-muted"
                                  />
                                ))}
                              </span>
                            ) : null}
                            {repliesCount > 0 ? (
                              <span className="font-mono text-label-sm text-muted-foreground tabular-nums">
                                {repliesLabel(repliesCount)}
                                {last ? ` · ${formatTime(last.createdAt)}` : ''}
                              </span>
                            ) : null}
                            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info">
                              {ui.chat.toThread}
                              <ArrowRight className="size-3" strokeWidth={1.75} />
                            </span>
                          </span>
                        </div>
                      </MessageMenu>
                    )}
                  </MessageRow>
                );
              })}
            </div>
          )}
        </div>
      </FeedDropzone>
      {conversation === null || canPostFeed(conversation) ? (
        <ChatComposer
          placeholder={ui.chat.newPostPlaceholder}
          focusId={scope}
          conversationId={conversationId}
          attachmentsEnabled
          onEditLast={handleEditLast}
          selection={selectionComposerProps(conversationId, selection)}
          onSubmit={handleSubmit}
        />
      ) : (
        // Островок композера в неактивном состоянии: та же геометрия/тень,
        // объяснение вместо ввода (обсуждение в тредах остаётся доступным).
        <div className="shrink-0 bg-chat-zone px-3 py-2">
          <div className="flex w-full items-center rounded-2xl bg-card px-3 py-2.5 shadow-sm">
            <span className="text-sm text-muted-foreground">{ui.chat.composerNoPostRights}</span>
          </div>
        </div>
      )}
    </div>
  );
});
