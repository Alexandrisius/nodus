import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Search, SquareArrowOutUpRight, X } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Input } from '@nodus/ui/components/input';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { NotesGlyph } from '../../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import {
  ChatPanelToggle,
  ChatSidePanel,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { ChannelView } from '../../../shared/chat/channel-view.js';
import { useConversations } from '../api/chat-api.js';
import { ConversationList } from '../components/conversation-list.js';
import {
  conversationSubtitle,
  conversationTitle,
  isNotesConversation,
} from '../lib/conversations.js';

type ChatTab = 'chats' | 'tasks';

/**
 * Мессенджер: слева — ЕДИНЫЙ список бесед по активности без секций
 * (вердикт владельца 2026-09-10, раунд 2); подразделы «Чаты» / «Чаты задач» —
 * в топбаре по канону каркаса (как виды задач и папки писем), search `?tab=`.
 * Чаты задач — обсуждения задач (type=task) с кнопкой «Открыть задачу»
 * (карточкой поверх, стек ADR-0009); справа — активная беседа. Каналы (в т.ч.
 * каналы проектов) — лента новостей-тредов: каждое сообщение — тред; тред
 * открывается ОКНОМ рядом с лентой (Slack-паттерн, #42; узкая зона —
 * drill-down с «К ленте»), механика — shared/chat/channel-view; тред —
 * search-параметр ?thread= (deep-link). Механика тредов и сообщений —
 * shared/chat (тот же код рендерит колонку обсуждения карточки проекта).
 */
export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const search = useSearch({ strict: false }) as { thread?: string; tab?: string };
  const tab: ChatTab = search.tab === 'tasks' ? 'tasks' : 'chats';
  const { data, isLoading } = useConversations();
  const meId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const openCard = useOpenCard();
  // Панель беседы (закон: у каждого чата) — хостится контейнером страницы,
  // тоггл — кнопка СПРАВА ВВЕРХУ шапки беседы (канон кнопки «О задаче»).
  const panel = useChatSidePanel();
  // Локальный поиск по списку бесед (модель Битрикс24: «Найти сотрудника
  // или чат»): подстрока по названию и подписи (последнее сообщение).
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const items = (data?.items ?? [])
    .filter((c) => (tab === 'tasks' ? c.type === 'task' : c.type !== 'task'))
    .filter(
      (c) =>
        !q ||
        conversationTitle(c, meId).toLowerCase().includes(q) ||
        conversationSubtitle(c).toLowerCase().includes(q),
    );
  const active = data?.items.find((c) => c.id === conversationId);

  return (
    <div className="relative flex h-full">
      {/* Список бесед — ступень ВНУТРИ мягкой рамы (bg-muted), не токен шелла:
          bg-sidebar в раме давал «чёрный список против светлой зоны»
          (вердикт владельца 12.09.2026, обе темы). */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-muted">
        {/* Шапка списка бесед — ВЫСОТОЙ h-14, как шапка беседы справа:
            горизонтальные линии двух зон совпадают (вердикт владельца
            12.09.2026: линии не совпадали — 48px против 56px). */}
        <div className="flex h-14 shrink-0 items-center border-b border-border px-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui.common.searchPlaceholder}
              aria-label={ui.common.search}
              className="h-8 pr-7 pl-8 text-sm"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={ui.filters.reset}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        </div>
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
            {isNotesConversation(active, meId) ? (
              <NotesGlyph className="size-9 shrink-0" />
            ) : (
              <PersonAvatar
                name={conversationTitle(active, meId)}
                avatarUrl={active.avatarUrl}
                className="size-9 shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {conversationTitle(active, meId)}
              </div>
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
              <ChannelView
                conversationId={active.id}
                threadRootId={search.thread ?? null}
                onOpenThread={(rootId) =>
                  void navigate({
                    to: '/chat/$conversationId',
                    params: { conversationId: active.id },
                    // Функциональная форма: посторонние search-параметры
                    // (стек карточек ?cards=) СОХРАНЯЮТСЯ — закрытие треда
                    // не размонтирует карточку поверх (вердикт валидатора
                    // #42: navigate c объектом затирает search целиком).
                    search: (prev) => ({ ...prev, thread: rootId }),
                  })
                }
                onCloseThread={() =>
                  void navigate({
                    to: '/chat/$conversationId',
                    params: { conversationId: active.id },
                    search: (prev) => ({ ...prev, thread: undefined }),
                  })
                }
              />
            ) : (
              <ConversationPane conversationId={active.id} showAuthor={active.type !== 'direct'} />
            )}
            {panel.mounted ? (
              <ChatSidePanel
                conversationId={active.id}
                open={panel.open}
                onClose={panel.close}
                threadRootId={search.thread ?? null}
              />
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
