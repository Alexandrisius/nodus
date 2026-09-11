import { ArrowRight } from 'lucide-react';
import { memo, useMemo } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../auth-store.js';
import { formatTime, plural } from '../lib/format.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { ChatComposer } from './chat-composer.js';
import { MessageAttachments, MessageReactions } from './chat-message.js';
import { MessageMenu } from './message-menu.js';
import { useConversationMessages, useSendChatMessage } from './api.js';

function repliesLabel(count: number): string {
  return `${count} ${plural(count, [ui.chat.repliesOne, ui.chat.repliesFew, ui.chat.repliesMany])}`;
}

/**
 * Лента канала (вердикт владельца 2026-09-10): каждое сообщение канала —
 * новость-тред. Корневые сообщения — плоские карточки-посты (не пузыри)
 * ОГРАНИЧЕННОЙ ширины (max-w-2xl, референс — каналы Битрикс24: пост не
 * тянется на всю ширину, действия под постом — рядом, не на другом краю
 * экрана): автор, текст, вложения, реакции; в подвале — участники обсуждения
 * (авторы ответов, ≤3 аватаров), счётчик ответов (скрыт при нуле — «0
 * ответов» шумит) и вход «Обсудить». Композер внизу создаёт НОВЫЙ тред
 * (корневой пост). Правый клик по посту — контекстное меню сообщения.
 * Правая панель беседы — у контейнера (шапка беседы), не у ленты.
 */
export const ThreadFeed = memo(function ThreadFeed({
  conversationId,
  onOpenThread,
}: {
  conversationId: string;
  onOpenThread: (rootId: string) => void;
}) {
  const { data, isLoading } = useConversationMessages(conversationId);
  const send = useSendChatMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];
  const roots = useMemo(
    () => items.filter((m) => m.threadRootId === null && m.replyToId === null),
    [items],
  );
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

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div data-feed-scroll className="min-h-0 flex-1 overflow-y-auto p-4">
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
                <MessageMenu
                  key={root.id}
                  message={root}
                  mine={root.author.id === me?.id}
                  conversationId={conversationId}
                >
                  <button
                    type="button"
                    data-thread-source={root.id}
                    onClick={() => onOpenThread(root.id)}
                    className="node-panel w-full max-w-2xl p-3.5 text-left transition-colors hover:border-input"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <PersonAvatar name={root.author.displayName} className="size-7 shrink-0" />
                      <span className="min-w-0 truncate font-medium">
                        {root.author.displayName}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(root.createdAt)}
                      </span>
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed whitespace-pre-wrap">
                      {root.text}
                    </span>
                    {root.attachments.length > 0 ? (
                      <span className="mt-2 block">
                        <MessageAttachments message={root} />
                      </span>
                    ) : null}
                    {root.reactions.length > 0 ? (
                      <span className="mt-2 block">
                        <MessageReactions message={root} />
                      </span>
                    ) : null}
                    <span className="mt-2.5 flex items-center gap-2">
                      {participants.length > 0 ? (
                        <span className="flex shrink-0 -space-x-1.5">
                          {participants.slice(0, 3).map((p) => (
                            <PersonAvatar
                              key={p.id}
                              name={p.displayName}
                              className="size-5 ring-2 ring-card"
                            />
                          ))}
                        </span>
                      ) : null}
                      {repliesCount > 0 ? (
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {repliesLabel(repliesCount)}
                          {last ? ` · ${formatTime(last.createdAt)}` : ''}
                        </span>
                      ) : null}
                      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-info uppercase">
                        {ui.chat.toThread}
                        <ArrowRight className="size-3" strokeWidth={1.75} />
                      </span>
                    </span>
                  </button>
                </MessageMenu>
              );
            })}
          </div>
        )}
      </div>
      <ChatComposer
        placeholder={ui.chat.newPostPlaceholder}
        onSend={(text) => send.mutate({ text })}
      />
    </div>
  );
});
