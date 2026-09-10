import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { ThreadFeed } from '../../../shared/chat/thread-feed.js';
import { ThreadPane } from '../../../shared/chat/thread-pane.js';
import { useConversations } from '../api/chat-api.js';
import { ConversationList } from '../components/conversation-list.js';
import { conversationSubtitle, conversationTitle } from '../lib/conversations.js';

/**
 * Мессенджер: список бесед слева (секции Каналы/Групповые/Личные) + активная
 * беседа справа. Каналы (в т.ч. каналы проектов) — лента новостей-тредов
 * (вердикт владельца 2026-09-10): каждое сообщение — тред, «провалиться
 * внутрь» = обычный чат; тред — search-параметр ?thread= (deep-link, не
 * теряется при перезагрузке). Групповые/личные — обычная лента сообщений.
 * Механика тредов и сообщений — shared/chat (тот же код рендерит вкладку
 * «Чат» панели проекта).
 */
export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const search = useSearch({ strict: false }) as { thread?: string };
  const { data, isLoading } = useConversations();
  const navigate = useNavigate();

  const active = data?.items.find((c) => c.id === conversationId);

  return (
    <div className="relative flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
        <header className="flex h-14 shrink-0 items-center px-4">
          <h1 className="text-lg font-semibold text-foreground">{ui.chat.title}</h1>
        </header>
        <ConversationList
          conversations={data?.items ?? []}
          isLoading={isLoading}
          activeId={conversationId}
          onSelect={(conversation) =>
            void navigate({
              to: '/chat/$conversationId',
              params: { conversationId: conversation.id },
            })
          }
        />
      </aside>

      {active ? (
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            <PersonAvatar
              name={conversationTitle(active)}
              avatarUrl={active.avatarUrl}
              className="size-9 shrink-0"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{conversationTitle(active)}</div>
              <div className="truncate font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {conversationSubtitle(active)}
              </div>
            </div>
          </header>
          {active.type === 'project_channel' ? (
            search.thread ? (
              <ThreadPane
                conversationId={active.id}
                threadRootId={search.thread}
                onBack={() =>
                  void navigate({
                    to: '/chat/$conversationId',
                    params: { conversationId: active.id },
                    search: {},
                  })
                }
              />
            ) : (
              <ThreadFeed
                conversationId={active.id}
                onOpenThread={(rootId) =>
                  void navigate({
                    to: '/chat/$conversationId',
                    params: { conversationId: active.id },
                    search: { thread: rootId },
                  })
                }
              />
            )
          ) : (
            <ConversationPane conversationId={active.id} showAuthor={active.type !== 'direct'} />
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyTitle>{ui.chat.selectConversation}</EmptyTitle>
          </Empty>
        </div>
      )}
    </div>
  );
}
