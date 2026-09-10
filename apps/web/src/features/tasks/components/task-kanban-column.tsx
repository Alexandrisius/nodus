import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { stageColorOrder, stageTone } from '../lib/stage-tone.js';

/**
 * Колонка канбана = SortableContext карточек + drop-зона стадии
 * (useDroppable, id = stage.id — пустая колонка принимает перенос).
 * Шапка — цветной чип стадии (палитра темы, референс ClickUp в грамматике
 * «Инструмента»: плоско, тонкие бордюры, моно-метка) и меню управления
 * личной колонкой (переименовать / цвет / удалить — ADR-0008, удаление
 * единственной запрещено). Наведение переноса — подсветка плоскостью.
 * Бесконечная подгрузка: sentinel у дна скролл-контейнера (IntersectionObserver,
 * root — контейнер); счётчик шапки — total из каталога стадий.
 */
export function TaskKanbanColumn({
  stage,
  count,
  cardIds,
  hasNext,
  loadingMore,
  canDelete,
  onLoadMore,
  onRename,
  onRecolor,
  onDelete,
  children,
}: {
  stage: TaskStageWithCount;
  count: number;
  cardIds: string[];
  hasNext: boolean;
  loadingMore: boolean;
  canDelete: boolean;
  onLoadMore: (stageId: string) => void;
  onRename: (stageId: string, name: string) => void;
  onRecolor: (stageId: string, color: StageColor) => void;
  onDelete: (stageId: string) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { over } = useDndContext();
  const overInColumn = isOver || (over !== null && cardIds.includes(String(over.id)));
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(stage.name);
  const tone = stageTone[stage.color];

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasNext || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore(stage.id);
      },
      { root },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadingMore, onLoadMore, stage.id]);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== stage.name) onRename(stage.id, name);
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-lg transition-colors',
        tone.tint,
        overInColumn && 'bg-accent/25',
      )}
    >
      <header className="group flex items-center gap-2 px-1 pb-2">
        {renaming ? (
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
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-[11px] tracking-[0.12em] uppercase outline-none focus:border-ring"
          />
        ) : (
          <span
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tracking-[0.12em] uppercase select-none',
              tone.chip,
            )}
          >
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} />
            <span className="truncate">{stage.name}</span>
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {count}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={ui.tasks.stageActions}
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
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
            <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {ui.tasks.deleteStageNote}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pt-1 pb-2"
        >
          {children}
          {count === 0 && !loadingMore ? (
            <span className="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
              {overInColumn ? ui.tasks.dropHere : ui.tasks.emptyColumn}
            </span>
          ) : null}
          {hasNext ? (
            <div ref={sentinelRef} className="flex justify-center py-2">
              {loadingMore ? <Skeleton className="h-10 w-full" /> : <span className="h-1" />}
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
