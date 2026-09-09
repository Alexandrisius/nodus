import { useEffect, useRef } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import type { TaskStageWithCount } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Колонка канбана = SortableContext карточек + drop-зона стадии
 * (useDroppable, id = stage.id — пустая колонка принимает перенос).
 * Наведение переноса — подсветка плоскостью и свечением порта шапки
 * (грамматика «Инструмента»: ховер — только цвет, без теней-подниманий).
 * Подсветка — когда over есть сама колонка ИЛИ любая её карточка (collision
 * multi-container резолвит over в карточку, а не в колонку).
 * Бесконечная подгрузка (industry/Битрикс): sentinel у дна скролл-контейнера
 * колонки (IntersectionObserver, root — контейнер) догружает курсорную
 * страницу; счётчик шапки — total из каталога стадий (totals в list-ответах
 * запрещены каноном api-conventions).
 */
export function TaskKanbanColumn({
  stage,
  count,
  cardIds,
  hasNext,
  loadingMore,
  onLoadMore,
  children,
}: {
  stage: TaskStageWithCount;
  count: number;
  cardIds: string[];
  hasNext: boolean;
  loadingMore: boolean;
  onLoadMore: (stageId: string) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { over } = useDndContext();
  const overInColumn = isOver || (over !== null && cardIds.includes(String(over.id)));
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-lg transition-colors',
        overInColumn && 'bg-accent/25',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-1 pb-2">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-port transition-shadow',
            overInColumn && 'shadow-[0_0_8px_var(--glow)]',
          )}
        />
        <NodeLabel label={stage.name} count={count} />
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pt-3 pb-2"
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
