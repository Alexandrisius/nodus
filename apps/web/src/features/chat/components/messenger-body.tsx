import { Megaphone, Plus, Search, SquarePen, Users, X } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Input } from '@nodus/ui/components/input';

import { useAuthStore } from '../../../shared/auth-store.js';
import { TaskQuickCreate } from '../../../shared/tasks/task-quick-create.js';
import { useConversations } from '../api/chat-api.js';
import { conversationSubtitle, conversationTitle } from '../lib/conversations.js';
import { ChatCreateDialog, type CreateConversationKind } from './chat-create-dialog.js';
import { ChatSettings } from './chat-settings.js';
import { ChatWorkspace } from './chat-workspace.js';
import { ConversationList } from './conversation-list.js';

export type ChatTab = 'chats' | 'tasks' | 'settings';

/**
 * ТЕЛО мессенджера — ЕДИНЫЙ код для страницы `/chat` И полноэкранной карточки
 * `messenger:<id>` (стек ADR-0009, план `docs/mvp/archive/messenger-fullscreen-plan.md`,
 * урок «чаты в задачах»: один код — ноль дублей, всё меняется одним проходом).
 *
 * Состав: список бесед с локальным поиском (модель Битрикс24 «Найти сотрудника
 * или чат») + рабочая область активной беседы; вкладка «Настройка» — отдельная
 * страница без списка. Кнопка справа от поиска — СВОЯ у вкладки (#96):
 * «Чаты» — создание группового чата/канала, «Чаты задач и писем» — создание
 * задачи. Вкладки (Чаты / Чаты задач / Настройка) рендерит ХОСТ:
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
  // Создание группового чата/канала (#91, реф Bitrix24: кнопка СПРАВА от
  // поиска с попапом команд; команда открывает окно настройки чата).
  const [createKind, setCreateKind] = useState<CreateConversationKind | null>(null);
  // Создание задачи — кнопка СВОЕЙ вкладки (#96, вердикт владельца 24.09.2026):
  // на «Чатах задач и писем» попапа чата/канала нет, там рождается ЗАДАЧА
  // (чаты задач и писем — обсуждения сущностей: появляются вместе с сущностью,
  // а не из попапа мессенджера) — экспресс-форма TaskQuickCreate.
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const items = (data?.items ?? [])
    // Вкладка «Чаты задач и писем» — обсуждения сущностей (задачи + письма);
    // основная вкладка — люди и каналы (модель v2 корреспонденции, #69).
    .filter((c) =>
      tab === 'tasks'
        ? c.type === 'task' || c.type === 'letter'
        : c.type !== 'task' && c.type !== 'letter',
    )
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
          {/* Кнопка СПРАВА от поиска — СВОЯ у каждой вкладки (#96, вердикт
              владельца 24.09.2026): на «Чатах» попап команд «Групповой чат»/
              «Канал» (реф Bitrix24, #91; команда открывает окно настройки
              чата), на «Чатах задач и писем» — создание ЗАДАЧИ (обсуждения
              сущностей рождаются с сущностью, попап мессенджера там неуместен).
              Вкладка «Настройка» уходит выше и кнопки не имеет. */}
          {tab === 'chats' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-1.5 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={ui.chat.createChat}
                  title={ui.chat.createChat}
                >
                  <SquarePen className="size-4" strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              {/* Попап команд: ЛЕВАЯ кромка попапа = левая кромка кнопки
                  (вердикт владельца 24.09: align start без смещения). */}
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setCreateKind('group')}>
                  <Users className="size-4" strokeWidth={1.75} />
                  {ui.chat.createGroupChat}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateKind('project_channel')}>
                  <Megaphone className="size-4" strokeWidth={1.75} />
                  {ui.chat.createChannel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-1.5 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={ui.tasks.createTask}
              title={ui.tasks.createTask}
              onClick={() => setCreateTaskOpen(true)}
            >
              <Plus className="size-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>
        {createKind ? (
          <ChatCreateDialog
            kind={createKind}
            onCreated={(conversationId) => {
              setCreateKind(null);
              onSelectConversation(conversationId);
            }}
            onClose={() => setCreateKind(null)}
          />
        ) : null}
        {/* Экспресс-форма задачи (#96) — общий компонент shared/tasks: создаёт
            задачу, тостом подтверждает и закрывается; её чат задачи появится
            во вкладке вместе с сущностью (обсуждения — от сущностей, не от
            мессенджера). */}
        {tab === 'tasks' ? (
          <TaskQuickCreate open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
        ) : null}
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
