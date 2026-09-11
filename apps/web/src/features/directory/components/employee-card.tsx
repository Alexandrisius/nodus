import { useMemo, useRef, useState } from 'react';
import type { PresenceStatus } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAssigneeTasks, useMemberProjects } from '../../../shared/api/user-relations.js';
import { useDirectConversation } from '../../../shared/chat/api.js';
import {
  ChatPanelToggle,
  ChatSidePanel,
  MIN_COLUMN_WITH_PANEL,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useChatWidth } from '../../../shared/ui/use-chat-width.js';
import { usePresence, useUserCard, useUsersList } from '../api/directory-api.js';
import { employeeProfileDefs } from '../lib/employee-profile-fields.js';
import { EmployeeCardSkeleton } from './employee-card-skeleton.js';
import { EmployeeProjectsTab, EmployeeTasksTab } from './employee-journal-tabs.js';

const VISIBILITY_KEY = 'nodus-employee-fields-v1';

const presenceTone: Record<PresenceStatus, 'success' | 'warning' | 'muted'> = {
  online: 'success',
  away: 'warning',
  offline: 'muted',
};

function presenceLabel(status: PresenceStatus): string {
  if (status === 'online') return ui.common.online;
  if (status === 'away') return ui.common.away;
  return ui.common.offline;
}

type EmployeeTab = 'profile' | 'tasks' | 'projects';

/**
 * Карточка сотрудника (стек карточек, ADR-0009) — анатомия карточки задачи
 * (вердикт владельца 2026-09-11, раунд 3): полоса — аватар-якорь + presence-
 * чип и позиция (имя — в хроме слайдера); ЛЕВАЯ зона — вкладки на всю
 * высоту: **Профиль** (поля-реестр полного UserCard + «Подчинённые»),
 * **Задачи** и **Проекты** — ПОЛНОЦЕННЫЕ журналы на shared-реестрах (все
 * поля + шестерёнка + ресайз колонок, как в модулях — «модули не отличаются»);
 * ПРАВАЯ колонка — личный диалог с сотрудником, виден ВСЕГДА (find-or-create,
 * контекстное меню и панель беседы — из shared/chat), перегородка тянется
 * с памятью (общая для всех карточек). Кнопки «Написать сообщение» больше
 * нет — чат уже здесь.
 */
export function EmployeeCard({ userId }: { userId: string }) {
  const { data: card, isLoading } = useUserCard(userId);
  const { data: usersData } = useUsersList();
  const { data: presence } = usePresence();
  const tasksQuery = useAssigneeTasks(userId);
  const projectsQuery = useMemberProjects(userId);
  const directQuery = useDirectConversation(userId);
  const openCard = useOpenCard();
  const [tab, setTab] = useState<EmployeeTab>('profile');
  // Панель беседы (закон чата): тоггл — в полосе КАРТОЧКИ справа вверху
  // (как кнопка «О задаче» — шапки у чата с именем/аватаром НЕТ, вердикт);
  // панель — внутри колонки чата (одна анимируемая ширина — левая зона не
  // дёргается); лента не уже 360 при открытой панели.
  const panel = useChatSidePanel();
  const chatRef = useRef<HTMLDivElement>(null);
  const { chatW, onDividerDown, dragging } = useChatWidth(
    chatRef,
    0,
    panel.open ? MIN_COLUMN_WITH_PANEL : undefined,
  );
  const columnW = panel.open ? Math.max(chatW, MIN_COLUMN_WITH_PANEL) : chatW;

  const items = useMemo(() => usersData?.items ?? [], [usersData]);
  const listItem = items.find((u) => u.id === userId);
  const manager = card?.managerId ? items.find((u) => u.id === card.managerId) : undefined;
  const subordinates = useMemo(() => items.filter((u) => u.managerId === userId), [items, userId]);
  const tasks = tasksQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const presenceStatus: PresenceStatus =
    presence?.find((p) => p.user.id === userId)?.status ?? 'offline';

  if (isLoading || !card || !listItem) {
    return <EmployeeCardSkeleton chatW={chatW} />;
  }

  const tabs: { id: EmployeeTab; label: string; count?: number }[] = [
    { id: 'profile', label: ui.employees.tabProfile },
    {
      id: 'tasks',
      label: ui.employees.tabTasks,
      count: tasksQuery.data ? tasks.length : undefined,
    },
    {
      id: 'projects',
      label: ui.employees.tabProjects,
      count: projectsQuery.data ? projects.length : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Полоса: аватар-якорь + presence + позиция (имя — в хроме слайдера) */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <PersonAvatar
            name={card.displayName}
            avatarUrl={card.avatarUrl}
            className="size-10 shrink-0"
          />
          <NodeChip tone={presenceTone[presenceStatus]} className="shrink-0">
            <span
              aria-hidden
              className={
                presenceStatus === 'online'
                  ? 'size-1.5 rounded-full bg-success'
                  : presenceStatus === 'away'
                    ? 'size-1.5 rounded-full bg-warning'
                    : 'size-1.5 rounded-full bg-muted-foreground'
              }
            />
            {presenceLabel(presenceStatus)}
          </NodeChip>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {listItem.positionName ?? ''}
            {listItem.departmentName ? ` · ${listItem.departmentName}` : ''}
          </span>
          <div className="ml-auto flex shrink-0 items-center">
            {directQuery.data ? (
              <ChatPanelToggle open={panel.open} onToggle={panel.toggle} />
            ) : null}
          </div>
        </div>
      </div>

      {/* Левая зона (вкладки) и колонка личного диалога — вертикальная
          граница структурная, зона чата — фон с первого кадра раскрытия. */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="relative flex min-h-0 flex-col border-r border-border @container">
          {/* Вкладки карточки (модель профиля Битрикс24, моно-ряд) — ТОЛЬКО
              вкладки; органы списков (поиск, фильтр, шестерёнка) — в строке
              инструментов вкладки (единый стандарт, вердикт владельца) */}
          <div className="content-fade flex shrink-0 items-center gap-1 border-b border-border px-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
                  tab === t.id
                    ? 'border-port text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground/80',
                )}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="content-fade min-h-0 flex-1 overflow-hidden">
            {tab === 'profile' ? (
              <div className="h-full overflow-y-auto p-6">
                <div className="mx-auto w-full max-w-4xl">
                  <EntityFields
                    defs={employeeProfileDefs({ card, listItem, manager, openCard })}
                    storageKey={VISIBILITY_KEY}
                  />
                  <div className="mt-8">
                    <NodeLabel label={ui.employees.subordinates} count={subordinates.length} />
                  </div>
                  <div className="mt-2.5 flex flex-col gap-1">
                    {subordinates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
                    ) : null}
                    {subordinates.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => openCard({ kind: 'employee', id: person.id })}
                        className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent/50"
                      >
                        <PersonAvatar name={person.displayName} className="size-7 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {person.positionName ?? ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'tasks' ? (
              <EmployeeTasksTab tasks={tasks} isLoading={tasksQuery.isLoading} />
            ) : null}

            {tab === 'projects' ? (
              <EmployeeProjectsTab projects={projects} isLoading={projectsQuery.isLoading} />
            ) : null}
          </div>

          {/* Ручка ресайза чата: невидимый оверлей ПОВЕРХ структурной границы
              (канон карточки задачи, память общая на все карточки) */}
          <div
            onPointerDown={onDividerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label={ui.common.resizePanel}
            title={ui.common.resizePanel}
            className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        {/* Колонка личного диалога: фон — структура с первого кадра; шапки
            у чата НЕТ (собеседник и так в хроме карточки — вердикт). Панель
            беседы — ВНУТРИ колонки справа: одна анимируемая ширина (левая
            зона не дёргается); лента не уже 360px при открытой панели. */}
        <div
          ref={chatRef}
          className={cn('min-h-0 overflow-hidden', !dragging && 'transition-[width] duration-200')}
          style={{ width: columnW }}
        >
          <div className="flex h-full w-full bg-background">
            <div className="content-fade min-h-0 min-w-0 flex-1">
              {directQuery.data ? (
                <ConversationPane
                  conversationId={directQuery.data.id}
                  showAuthor={false}
                  emptyLabel={ui.chat.directEmpty}
                />
              ) : (
                <div className="flex flex-col gap-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-2/3" />
                  ))}
                </div>
              )}
            </div>
            {panel.mounted && directQuery.data ? (
              <ChatSidePanel
                conversationId={directQuery.data.id}
                open={panel.open}
                onClose={panel.close}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
