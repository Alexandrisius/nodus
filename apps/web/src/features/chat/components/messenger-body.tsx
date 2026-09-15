import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Input } from '@nodus/ui/components/input';

import { useAuthStore } from '../../../shared/auth-store.js';
import { useConversations } from '../api/chat-api.js';
import { conversationSubtitle, conversationTitle } from '../lib/conversations.js';
import { ChatSettings } from './chat-settings.js';
import { ChatWorkspace } from './chat-workspace.js';
import { ConversationList } from './conversation-list.js';

export type ChatTab = 'chats' | 'tasks' | 'settings';

/**
 * ТЕЛО мессенджера — ЕДИНЫЙ код для страницы `/chat` И полноэкранной карточки
 * `messenger:<id>` (стек ADR-0009, план `docs/mvp/messenger-fullscreen-plan.md`,
 * урок «чаты в задачах»: один код — ноль дублей, всё меняется одним проходом).
 *
 * Состав: список бесед с локальным поиском (модель Битрикс24 «Найти сотрудника
 * или чат») + рабочая область активной беседы; вкладка «Настройка» — отдельная
 * страница без списка. Вкладки (Чаты / Чаты задач / Настройка) рендерит ХОСТ:
 * страница — в топбаре шелла (search `?tab=`), карточка — в своём хроме
 * (`MessengerTabs`, порты для контура). Хост владеет и выбором беседы/треда:
 * страница — через маршрут (deep-link), карточка — локальным состоянием.
 * Данные — те же query-ключи TanStack: страница и карточка читают ОДИН кэш.
 */
export function MessengerBody({
  tab,
  conversationId,
  onSelectConversation,
  threadRootId,
  onOpenThread,
  onCloseThread,
}: {
  tab: ChatTab;
  conversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  threadRootId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
}) {
  const { data, isLoading } = useConversations();
  const meId = useAuthStore((s) => s.user?.id);
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

  // Подмодуль «Настройка» (вердикт владельца 14.09.2026, модель Битрикс24):
  // отдельная страница мессенджера без списка бесед.
  if (tab === 'settings') {
    return (
      <div className="relative flex h-full flex-col">
        <ChatSettings />
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Список бесед — на тоне панели (`card`), как весь хром мессенджера:
          отдельная бежевая ступень колонки давала «зоопарк оттенков» в
          светлой теме (вердикт владельца 14.09.2026); зону от списка
          отделяет hairline border-r. */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
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
          onSelect={(conversation) => onSelectConversation(conversation.id)}
        />
      </aside>

      {active ? (
        <ChatWorkspace
          conversation={active}
          threadRootId={threadRootId}
          onOpenThread={onOpenThread}
          onCloseThread={onCloseThread}
        />
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
