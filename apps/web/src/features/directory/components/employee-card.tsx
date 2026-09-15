import { useMemo, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useAssigneeTasks, useMemberProjects } from '../../../shared/api/user-relations.js';
import { useDirectConversation } from '../../../shared/chat/api.js';
import {
  CHAT_PANEL_W,
  ChatPanelToggle,
  ChatSidePanel,
  MIN_COLUMN_WITH_PANEL,
  MIN_FEED_WITH_PANEL,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { TaskQuickCreate } from '../../../shared/tasks/task-quick-create.js';
import { useChatWidth } from '../../../shared/ui/use-chat-width.js';
import { usePresence, useUserCard, useUsersList } from '../api/directory-api.js';
import { EmployeeCardSkeleton } from './employee-card-skeleton.js';
import { EmployeeProjectsTab, EmployeeTasksTab } from './employee-journal-tabs.js';
import { EmployeeProfileTab } from './employee-profile-tab.js';

type EmployeeTab = 'profile' | 'tasks' | 'projects';

/**
 * Карточка сотрудника (стек карточек, ADR-0009) — анатомия карточки проекта
 * (вердикт владельца 15.09.2026): ЕДИНЫЙ бар h-10 на всю карточку — вкладки
 * (**Профиль**, **Задачи**, **Проекты**) слева + тоггл панели беседы справа;
 * общего бара h-16 с аватаром НЕТ (его инфа дублировала поля карточки, имя —
 * в хроме слайдера, полезная высота — данным; фотография — БОЛЬШАЯ, во
 * вкладке «Профиль», модель Битрикс24). ЛЕВАЯ зона — контент вкладок на всю
 * высоту: «Профиль» (большое фото + поля-реестр полного UserCard +
 * «Подчинённые»), «Задачи» и «Проекты» — ПОЛНОЦЕННЫЕ журналы на
 * shared-реестрах (все поля + шестерёнка + ресайз колонок, как в модулях —
 * «модули не отличаются»); «Задачи» — с кнопкой «Создать» слева от поиска
 * (закон кнопки создания; экспресс-форма shared/tasks, исполнитель = сам
 * сотрудник). ПРАВАЯ колонка — личный диалог, виден ВСЕГДА (find-or-create,
 * контекстное меню и панель беседы — из shared/chat); панель беседы занимает
 * ширину ЗА СЧЁТ ЧАТА (чат сужается на её ширину, левая зона не двигается —
 * закон панели «О задаче»); перегородка тянется с памятью (общая для всех
 * карточек). Кнопки «Написать сообщение» нет — чат уже здесь.
 */
export function EmployeeCard({ userId }: { userId: string }) {
  const { data: card, isLoading } = useUserCard(userId);
  const { data: usersData } = useUsersList();
  const { data: presence } = usePresence();
  const tasksQuery = useAssigneeTasks(userId);
  const projectsQuery = useMemberProjects(userId);
  const directQuery = useDirectConversation(userId);
  const [tab, setTab] = useState<EmployeeTab>('profile');
  // Панель беседы (закон чата): тоггл — в ЕДИНОМ баре карточки справа (канон
  // кнопки «О задаче» — шапки у чата с именем/аватаром НЕТ, вердикт);
  // панель — полновысотный сиблинг, ширина — ЗА СЧЁТ ЧАТА (левая зона не
  // дёргается); лента не уже 360 при открытой панели.
  const panel = useChatSidePanel();
  // Экспресс-форма задачи ИЗ КАРТОЧКИ сотрудника (вердикт владельца
  // 15.09.2026, модель Битрикс24): исполнитель подставляется сам сотрудник.
  const [createOpen, setCreateOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const { chatW, onDividerDown, dragging } = useChatWidth(
    chatRef,
    0,
    panel.open ? MIN_COLUMN_WITH_PANEL : undefined,
  );
  // Панель беседы занимает ширину ЗА СЧЁТ ЧАТА (закон панели «О задаче»:
  // левая зона и разделитель не двигаются, вердикт владельца 15.09.2026 —
  // раньше панель толкала левую зону): чат сужается на её ширину, лента не
  // уже 360 (MIN_COLUMN_WITH_PANEL в drag-минимуме выше).
  const columnW = panel.open ? Math.max(chatW - CHAT_PANEL_W, MIN_FEED_WITH_PANEL) : chatW;

  const items = useMemo(() => usersData?.items ?? [], [usersData]);
  const listItem = items.find((u) => u.id === userId);
  const manager = card?.managerId ? items.find((u) => u.id === card.managerId) : undefined;
  const subordinates = useMemo(() => items.filter((u) => u.managerId === userId), [items, userId]);
  const tasks = tasksQuery.data?.items ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const presenceStatus = presence?.find((p) => p.user.id === userId)?.status ?? 'offline';

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
    // Панель беседы — ПОЛНОВЫСОТНЫЙ сиблинг всей карточки (вердикт владельца
    // 15.09.2026, рефы Битрикс24): занимает единый бар карточки тоже.
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* ЕДИНЫЙ бар карточки (h-10, как у карточки проекта): вкладки слева,
          тоггл панели беседы — крайний справа (вердикт владельца 15.09.2026:
          общий бар с аватаром удалён — дублирующая инфа, полезная высота —
          данным левой зоны). */}
        <div className="content-fade flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
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
          <div className="ml-auto flex shrink-0 items-center">
            {directQuery.data ? (
              <ChatPanelToggle open={panel.open} onToggle={panel.toggle} />
            ) : null}
          </div>
        </div>

        {/* Левая зона (контент вкладки) и колонка личного диалога:
          вертикальная граница структурная, зона чата — фон с первого кадра. */}
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <div className="relative flex min-h-0 flex-col border-r border-border @container">
            <div className="content-fade min-h-0 flex-1 overflow-hidden">
              {tab === 'profile' ? (
                <EmployeeProfileTab
                  card={card}
                  listItem={listItem}
                  manager={manager}
                  subordinates={subordinates}
                  presenceStatus={presenceStatus}
                />
              ) : null}

              {tab === 'tasks' ? (
                <EmployeeTasksTab
                  tasks={tasks}
                  isLoading={tasksQuery.isLoading}
                  onCreateTask={() => setCreateOpen(true)}
                />
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
            у чата НЕТ. Панель беседы — полновысотный сиблинг СПРАВА от всей
            карточки, её ширина — ЗА СЧЁТ ЧАТА (чат сужается, левая зона не
            двигается — см. columnW). */}
          <div
            ref={chatRef}
            className={cn(
              'min-h-0 overflow-hidden',
              // ease-out — КАК У ПАНЕЛИ беседы: кривые width-анимаций двух
              // колонок обязаны совпадать покадрово, иначе их сумма «плывёт»
              // в середине, и левая зона дёргается (баг-вердикт 15.09.2026).
              !dragging && 'transition-[width] duration-200 ease-out',
            )}
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
            </div>
          </div>
        </div>
      </div>
      {directQuery.data ? (
        <ChatSidePanel
          conversationId={directQuery.data.id}
          open={panel.open}
          onClose={panel.close}
          title={ui.chat.aboutChat}
          headerClass="h-10"
        />
      ) : null}
      <TaskQuickCreate open={createOpen} onOpenChange={setCreateOpen} defaultAssigneeId={userId} />
    </div>
  );
}
