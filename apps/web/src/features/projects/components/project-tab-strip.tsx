import { History, ListTodo, ListTree, MessagesSquare, Plus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { ChatPanelToggle } from '../../../shared/chat/chat-side-panel.js';
import { useProjectTabs, type ProjectTabId } from '../lib/project-tabs.js';

const TAB_DEFS: { id: ProjectTabId; label: string; icon: LucideIcon }[] = [
  { id: 'structure', label: ui.projects.tabStructure, icon: ListTree },
  { id: 'tasks', label: ui.projects.tabTasks, icon: ListTodo },
  { id: 'channel', label: ui.projects.tabChannel, icon: MessagesSquare },
  { id: 'members', label: ui.projects.tabMembers, icon: Users },
  { id: 'history', label: ui.projects.tabHistory, icon: History },
];

/**
 * Полоса вкладок рабочей зоны: вкладки живут в ПРАВОЙ части карточки — их
 * левый край начинается от границы панели «О проекте», поэтому при
 * перетаскивании перегородки полоса едет вместе с зоной. «+» управляет
 * набором вкладок (личная память); первичная вкладка («Структура» при узлах
 * с задачами, иначе «Задачи», #467) не скрывается. Персональный порядок
 * перетаскиванием — следом.
 */
export function ProjectTabStrip({
  tab,
  onTab,
  primary,
  unread,
  channelPanel,
}: {
  tab: ProjectTabId;
  onTab: (tab: ProjectTabId) => void;
  /** Первичная вкладка (нельзя скрыть). */
  primary: ProjectTabId;
  /** Непрочитанные канала — счётчик на вкладке. */
  unread?: number;
  /** Панель «О канале»: тоггл — НА ПОЛОСЕ ВКЛАДОК (как в письмах), второго
   *  бара под вкладками нет — вердикт владельца 07.11.2026. */
  channelPanel?: { open: boolean; onToggle: () => void } | null;
}) {
  const { toggle, visible } = useProjectTabs(primary);

  return (
    <div
      role="tablist"
      aria-label={ui.projects.tabsLabel}
      className="content-fade flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-3"
    >
      {TAB_DEFS.filter((def) => visible.includes(def.id)).map((def) => {
        const active = def.id === tab;
        return (
          <button
            key={def.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTab(def.id)}
            className={cn(
              'flex h-10 shrink-0 items-center gap-1.5 rounded-none border-b-2 px-2.5 text-body-xs font-medium transition-colors',
              active
                ? 'border-port text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground/80',
            )}
          >
            <def.icon className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
            <span className="truncate">{def.label}</span>
            {def.id === 'channel' && unread && !active ? (
              <span className="font-mono text-label-sm text-port tabular-nums">{unread}</span>
            ) : null}
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ui.projects.tabsManage}
            title={ui.projects.tabsManage}
            className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {TAB_DEFS.map((def) => (
            <DropdownMenuCheckboxItem
              key={def.id}
              checked={visible.includes(def.id)}
              disabled={def.id === primary}
              onCheckedChange={() => toggle(def.id)}
              onSelect={(event) => event.preventDefault()}
            >
              {def.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Тоггл панели «О канале» — ВСЕГДА у правого края полосы: «+» остаётся
          сразу за вкладками и не улетает вправо (вердикт владельца 07.11.2026). */}
      {channelPanel ? (
        <div className="ml-auto flex h-10 shrink-0 items-center pr-1">
          <ChatPanelToggle open={channelPanel.open} onToggle={channelPanel.onToggle} />
        </div>
      ) : null}
    </div>
  );
}
