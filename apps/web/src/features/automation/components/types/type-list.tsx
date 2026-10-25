import { useState } from 'react';
import type { ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';

import { useArchiveProcessType } from '../../api/automation-api.js';
import { groupByCategory } from '../../lib/group-by-category.js';
import { useCanManageWorkflows } from '../../lib/use-can-manage-workflows.js';
import { ProcessTypeGlyph } from '../../../../shared/workflow/process-type-icon.js';
import { ProcessTypeCreateDialog } from './type-create-dialog.js';
import { pluralRu } from '../../lib/plural-ru.js';
import { toneOf } from './tone-of.js';

/** Мета строки: «7 статусов · 128 задач». */
export function typeMeta(stages: number, tasks: number): string {
  return `${stages} ${pluralRu(stages, ui.automation.statStages)} · ${tasks} ${pluralRu(tasks, ui.automation.statTasks)}`;
}

/**
 * Левая колонка типов процессов — грамматика списка бесед мессенджера:
 * шапка h-14 с поиском и кнопкой «+», строки «плитка-значок + название +
 * мета», меню «⋯» по ховеру строки (настройки/копировать/архив), архив —
 * свёрнутой группой внизу. Название раздела НЕ дублируется (вкладка — в
 * топбаре). Категории — группами с заголовками при двух и больше.
 */
export function TypeList({
  types,
  stageCounts,
  taskCounts,
  dirtyIds,
  selectedId,
  isLoading,
  onSelect,
  onOpenSettings,
  onCopyType,
}: {
  types: ProcessType[];
  stageCounts: Record<string, number>;
  taskCounts: Record<string, number>;
  /** Типы с несохранённым черновиком маршрута (точка в строке). */
  dirtyIds: ReadonlySet<string>;
  selectedId: string | undefined;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onCopyType: (id: string) => void;
}) {
  const canManage = useCanManageWorkflows();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archive = useArchiveProcessType(true);
  const restore = useArchiveProcessType(false);

  const q = query.trim().toLowerCase();
  const alive = types.filter((t) => !t.archivedAt && (!q || t.name.toLowerCase().includes(q)));
  const archived = types.filter((t) => t.archivedAt && (!q || t.name.toLowerCase().includes(q)));
  const aliveGroups = groupByCategory(alive);
  const archivedGroups = groupByCategory(archived);

  /** Список с заголовками категорий, когда их две и больше. */
  const list = (items: ProcessType[], groups: ReturnType<typeof groupByCategory>) =>
    groups.length > 1
      ? groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-0.5">
            <NodeLabel
              label={ui.automation.categoryGroups[group.category]}
              className="px-2.5 pt-2 pb-1"
            />
            {group.types.map(row)}
          </div>
        ))
      : items.map(row);

  const row = (type: ProcessType) => {
    const selected = type.id === selectedId;
    const dirty = dirtyIds.has(type.id);
    const rowArchived = type.archivedAt !== null;
    return (
      <div key={type.id} className="group/row relative">
        <button
          type="button"
          onClick={() => !rowArchived && onSelect(type.id)}
          aria-current={selected || undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors',
            !rowArchived && 'cursor-pointer',
            selected ? 'bg-accent' : !rowArchived && 'hover:bg-accent/40',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border',
              toneOf(type.color),
            )}
          >
            <ProcessTypeGlyph icon={type.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium">{type.name}</span>
              {dirty ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-warning"
                  title={ui.automation.chipDraft}
                />
              ) : null}
              {type.isSystem ? (
                <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 text-muted-foreground">
                  {ui.automation.badgeSystem}
                </span>
              ) : null}
              {!type.creatable && !rowArchived ? (
                <span className="shrink-0 text-[10px] leading-4 text-muted-foreground">
                  {ui.automation.badgeHidden}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-label-sm text-muted-foreground">
              {typeMeta(stageCounts[type.id] ?? 0, taskCounts[type.id] ?? 0)}
            </span>
          </span>
        </button>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={ui.common.rowMenu}
              className={cn(
                'absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100',
                selected && 'opacity-100',
              )}
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!rowArchived ? (
                <>
                  <DropdownMenuItem onSelect={() => onOpenSettings(type.id)}>
                    <Settings2 className="size-3.5" />
                    {ui.automation.typeSettings}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onCopyType(type.id)}>
                    <Copy className="size-3.5" />
                    {ui.automation.menuCopyType}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                disabled={type.isSystem}
                title={type.isSystem ? ui.automation.archiveSystemLocked : undefined}
                onSelect={() => (rowArchived ? restore.mutate(type.id) : archive.mutate(type.id))}
              >
                {rowArchived ? (
                  <ArchiveRestore className="size-3.5" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                {rowArchived ? ui.automation.restoreFromArchive : ui.automation.menuArchive}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui.automation.searchTypes}
            aria-label={ui.automation.searchTypes}
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
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label={ui.automation.newType}
            title={ui.automation.newType}
            className="ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">…</div>
        ) : alive.length > 0 ? (
          list(alive, aliveGroups)
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">{ui.common.empty}</div>
        )}
        {archived.length > 0 ? (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40"
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
              {ui.automation.archiveGroup} · {archived.length}
            </button>
            {archiveOpen ? list(archived, archivedGroups) : null}
          </div>
        ) : null}
      </div>

      {createOpen ? <ProcessTypeCreateDialog onClose={() => setCreateOpen(false)} /> : null}
    </aside>
  );
}
