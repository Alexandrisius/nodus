import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { TaskType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';
import { ChevronDown } from 'lucide-react';

import { useCanManageWorkflows } from '../../lib/use-can-manage-workflows.js';
import { TaskTypeGlyph } from '../../../../shared/workflow/task-type-icon.js';
import { TaskTypeCreateDialog } from './type-create-dialog.js';
import { pluralRu } from '../../lib/plural-ru.js';

/** Мета строки: «7 статусов · 128 задач». */
export function typeMeta(stages: number, tasks: number): string {
  return `${stages} ${pluralRu(stages, ui.automation.statStages)} · ${tasks} ${pluralRu(tasks, ui.automation.statTasks)}`;
}

/**
 * Левая колонка «Типы задач» (канон списковых колонок: bg-muted, ~288px):
 * строка — значок в цветном квадрате, название, мета, бейджи «Системный» и
 * «Скрыт»; архив — свёрнутой группой внизу. «+ Новый тип» — только с правом
 * `task.workflow_manage`.
 */
export function TypeList({
  types,
  stageCounts,
  taskCounts,
}: {
  types: TaskType[];
  stageCounts: Record<string, number>;
  taskCounts: Record<string, number>;
}) {
  const canManage = useCanManageWorkflows();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { type?: string };
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const alive = types.filter((t) => !t.archivedAt);
  const archived = types.filter((t) => t.archivedAt);

  const row = (type: TaskType) => {
    const selected = search.type === type.id;
    return (
      <button
        key={type.id}
        type="button"
        onClick={() => {
          void navigate({
            to: '/automation',
            search: (prev) => ({ ...prev, tab: 'types', type: type.id }),
          });
        }}
        aria-current={selected || undefined}
        className={cn(
          'flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors',
          selected ? 'bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md border',
              toneOf(type.color),
            )}
          >
            <TaskTypeGlyph icon={type.icon} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{type.name}</span>
          {type.isSystem ? <NodeChip tone="muted">{ui.automation.badgeSystem}</NodeChip> : null}
          {!type.creatable ? <NodeChip tone="muted">{ui.automation.badgeHidden}</NodeChip> : null}
        </span>
        <span className="pl-8 text-xs text-muted-foreground">
          {typeMeta(stageCounts[type.id] ?? 0, taskCounts[type.id] ?? 0)}
        </span>
      </button>
    );
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-1 bg-muted p-2">
      <div className="flex items-center justify-between px-1.5 py-1">
        <span className="text-label font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {ui.automation.typesListTitle}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{alive.length}</span>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
        >
          + {ui.automation.newType}
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {alive.map(row)}
        {archived.length > 0 ? (
          <div className="mt-auto">
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50"
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', !archiveOpen && '-rotate-90')}
                strokeWidth={1.75}
              />
              {ui.automation.archiveGroup} · {archived.length}
            </button>
            {archiveOpen ? archived.map(row) : null}
          </div>
        ) : null}
      </div>
      {createOpen ? <TaskTypeCreateDialog onClose={() => setCreateOpen(false)} /> : null}
    </aside>
  );
}

function toneOf(color: TaskType['color']): string {
  const tones: Record<TaskType['color'], string> = {
    neutral: 'border-border bg-muted text-muted-foreground',
    info: 'border-info/40 bg-info-soft/60 text-info',
    success: 'border-success/40 bg-success-soft/60 text-success',
    warning: 'border-warning/40 bg-warning-soft/60 text-warning',
    danger: 'border-danger/40 bg-danger-soft/60 text-danger',
  };
  return tones[color];
}
