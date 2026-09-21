import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StageColor, TaskStageWithCount } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { BoardColumn } from '../../../shared/ui/board/board-column.js';
import { stageColorOrder, stageTone } from '../../../shared/ui/board/stage-tone.js';

/**
 * Колонка канбана «Мой план» (личная схема, ADR-0008) — доменная обёртка
 * общей оболочки BoardColumn: CRUD личной колонки (меню «⋯»: переименовать
 * инлайн / цвет / удалить — единственную нельзя, задачи переезжают в первую
 * колонку того же состояния) и быстрое создание задачи в колонку.
 * У проектной доски этого нет — там BoardColumn используется напрямую.
 */
export function TaskKanbanColumn({
  stage,
  count,
  total,
  cardIds,
  hasNext,
  loadingMore,
  canDelete,
  onLoadMore,
  onRename,
  onRecolor,
  onDelete,
  onCreateTask,
  children,
}: {
  stage: TaskStageWithCount;
  count: number;
  /** Общий счётчик без фильтра (шапка «n из m» при активном фильтре). */
  total?: number;
  cardIds: string[];
  hasNext: boolean;
  loadingMore: boolean;
  canDelete: boolean;
  onLoadMore: (stageId: string) => void;
  onRename: (stageId: string, name: string) => void;
  onRecolor: (stageId: string, color: StageColor) => void;
  onDelete: (stageId: string) => void;
  /** Быстрое создание задачи в колонку (плюсик в шапке, ClickUp/Битрикс). */
  onCreateTask: (stageId: string, title: string) => void;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(stage.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== stage.name) onRename(stage.id, name);
  }

  return (
    <BoardColumn
      stage={stage}
      count={count}
      total={total}
      cardIds={cardIds}
      hasNext={hasNext}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      emptyLabel={ui.tasks.emptyColumn}
      dropLabel={ui.tasks.dropHere}
      quickAdd={{
        placeholder: ui.tasks.quickTaskPlaceholder,
        addButtonLabel: ui.tasks.create,
        onCreate: onCreateTask,
      }}
      chipOverride={
        renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraftName(stage.name);
                setRenaming(false);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs font-medium outline-none focus:border-ring"
          />
        ) : undefined
      }
      headerActions={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={ui.tasks.stageActions}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={() => {
                setDraftName(stage.name);
                setRenaming(true);
              }}
            >
              {ui.tasks.renameStage}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{ui.tasks.stageColor}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {stageColorOrder.map((color) => (
                  <DropdownMenuItem key={color} onSelect={() => onRecolor(stage.id, color)}>
                    <span
                      aria-hidden
                      className={cn('size-2.5 rounded-full', stageTone[color].swatch)}
                    />
                    <span>{ui.tasks.stageColors[color]}</span>
                    {stage.color === color ? <span className="ml-auto">✓</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              onSelect={() => onDelete(stage.id)}
            >
              {ui.tasks.deleteStage}
            </DropdownMenuItem>
            <p className="px-2 py-1.5 text-label leading-snug text-muted-foreground">
              {ui.tasks.deleteStageNote}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {children}
    </BoardColumn>
  );
}
