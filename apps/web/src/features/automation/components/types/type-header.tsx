import { ui } from '@nodus/contracts';
import type { TaskType, WorkflowDetail } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Switch } from '@nodus/ui/components/switch';
import { Archive, ArchiveRestore, Copy, MoreHorizontal } from 'lucide-react';

import { useArchiveTaskType, useUpdateTaskType } from '../../api/automation-api.js';
import { useCanManageWorkflows } from '../../lib/use-can-manage-workflows.js';
import { TaskTypeGlyph } from '../../../../shared/workflow/task-type-icon.js';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Шапка типа над холстом (строка инструментов h-14 без border-b): значок и
 * название (клик — настройки в инспекторе), чип версии («Опубликовано …» /
 * «Есть неопубликованные изменения»), переключатель «Доступен при создании
 * задач», меню «⋯» — копировать / в архив. Свойства сохраняются сразу.
 */
export function TypeHeader({
  type,
  workflow,
  dirty,
  onOpenSettings,
  onCopyType,
}: {
  type: TaskType;
  workflow: WorkflowDetail | undefined;
  dirty: boolean;
  onOpenSettings: () => void;
  onCopyType: () => void;
}) {
  const canManage = useCanManageWorkflows();
  const update = useUpdateTaskType();
  const archive = useArchiveTaskType(true);
  const restore = useArchiveTaskType(false);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4">
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={ui.automation.typeSettings}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/50"
      >
        <TaskTypeGlyph icon={type.icon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{type.name}</span>
      </button>

      {dirty ? (
        <span className="shrink-0 rounded-full border border-warning/40 bg-warning-soft/60 px-2 py-0.5 text-xs text-warning">
          {ui.automation.chipDraft}
        </span>
      ) : workflow?.publishedAt ? (
        <span
          className="shrink-0 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-xs text-muted-foreground"
          title={workflow.publishedBy ? workflow.publishedBy.displayName : undefined}
        >
          {ui.automation.chipPublishedAt} {formatDate(workflow.publishedAt)}
          {workflow.publishedBy ? ` · ${workflow.publishedBy.displayName}` : ''}
        </span>
      ) : null}

      {canManage ? (
        <>
          <label className="ml-2 flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={type.creatable}
              onCheckedChange={(checked) =>
                update.mutate({ id: type.id, body: { creatable: checked } })
              }
            />
            {ui.automation.creatableToggle}
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={ui.common.rowMenu}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={onCopyType}>
                <Copy className="size-3.5" />
                {ui.automation.menuCopyType}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenSettings}>
                <MoreHorizontal className="size-3.5" />
                {ui.automation.typeSettings}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={type.isSystem}
                title={type.isSystem ? ui.automation.archiveSystemLocked : undefined}
                onSelect={() =>
                  type.archivedAt ? restore.mutate(type.id) : archive.mutate(type.id)
                }
              >
                {type.archivedAt ? (
                  <ArchiveRestore className="size-3.5" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                {type.archivedAt ? ui.automation.restoreFromArchive : ui.automation.menuArchive}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  );
}
