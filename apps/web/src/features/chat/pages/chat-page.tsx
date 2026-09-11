import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { SquareArrowOutUpRight } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import {
  ChatPanelToggle,
  ChatSidePanel,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { ThreadFeed } from '../../../shared/chat/thread-feed.js';
import { ThreadPane } from '../../../shared/chat/thread-pane.js';
import { useConversations } from '../api/chat-api.js';
import { ConversationList } from '../components/conversation-list.js';
import { conversationSubtitle, conversationTitle } from '../lib/conversations.js';

type ChatTab = 'chats' | 'tasks';

/**
 * Мессенджер: слева — ЕДИНЫЙ список бесед по активности без секций
 * (вердикт владельца 2026-09-10, раунд 2); подразделы «Чаты» / «Чаты задач» —
 * в топбаре по канону каркаса (как виды задач и папки писем), search `?tab=`.
 * Чаты задач — обсуждения задач (type=task) с кнопкой «Открыть задачу»
 * (карточкой поверх, стек ADR-0009); справа — активная беседа. Каналы (в т.ч.
 * каналы проектов) — лента новостей-тредов: каждое сообщение — тред,
 * «провалиться внутрь» = обычный чат; тред — search-параметр ?thread=
 * (deep-link). Механика тредов и сообщений — shared/chat (тот же код
 * рендерит колонку обсуждения карточки проекта).
 */
export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const search = useSearch({ strict: false }) as { thread?: string; tab?: string };
  const tab: ChatTab = search.tab === 'tasks' ? 'tasks' : 'chats';
  const { data, isLoading } = useConversations();
  const navigate = useNavigate();
  const openCard = useOpenCard();
  // Панель беседы (закон: у каждого чата) — хостится контейнером страницы,
  // тоггл — кнопка СПРАВА ВВЕРХУ шапки беседы (канон кнопки «О задаче»).
  const panel = useChatSidePanel();

  const items = (data?.items ?? []).filter((c) =>
    tab === 'tasks' ? c.type === 'task' : c.type !== 'task',
  );
  const active = data?.items.find((c) => c.id === conversationId);

  return (
    <div className="relative flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
        <ConversationList
          conversations={items}
          isLoading={isLoading}
          activeId={conversationId}
          emptyLabel={tab === 'tasks' ? ui.chat.taskChatsEmpty : ui.common.empty}
          onSelect={(conversation) =>
            void navigate({
              to: '/chat/$conversationId',
              params: { conversationId: conversation.id },
              search: tab === 'chats' ? {} : { tab },
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
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {active.type === 'task' && active.task ? (
                <button
                  type="button"
                  onClick={() => openCard({ kind: 'task', id: active.task?.id ?? '' })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-input hover:text-foreground"
                >
                  {ui.chat.openTask}
                  <SquareArrowOutUpRight className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
              <ChatPanelToggle open={panel.open} onToggle={panel.toggle} />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            {active.type === 'project_channel' ? (
              search.thread ? (
                <ThreadPane
                  conversationId={active.id}
                  threadRootId={search.thread}
                  onBack={() =>
                    void navigate({
                      to: '/chat/$conversationId',
                      params: { conversationId: active.id },
                      search: tab === 'chats' ? {} : { tab },
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
                      search: tab === 'chats' ? { thread: rootId } : { tab, thread: rootId },
                    })
                  }
                />
              )
            ) : (
              <ConversationPane conversationId={active.id} showAuthor={active.type !== 'direct'} />
            )}
            {panel.mounted ? (
              <ChatSidePanel conversationId={active.id} open={panel.open} onClose={panel.close} />
            ) : null}
          </div>
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
