import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { TaskStage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Колонка канбана = drop-зона стадии (useDroppable, id = stage.id).
 * Наведение переноса — подсветка плоскостью и свечением порта шапки
 * (грамматика «Инструмента»: ховер — только цвет, без теней-подниманий).
 * Пустая колонка принимает перенос и подсказывает моно-меткой.
 */
export function TaskKanbanColumn({
  stage,
  count,
  children,
}: {
  stage: TaskStage;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-lg transition-colors',
        isOver && 'bg-accent/25',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-1 pb-2">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-port transition-shadow',
            isOver && 'shadow-[0_0_8px_var(--glow)]',
          )}
        />
        <NodeLabel label={stage.name} count={count} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pt-3 pb-2">
        {children}
        {count === 0 ? (
          <span className="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
            {isOver ? ui.tasks.dropHere : ui.tasks.emptyColumn}
          </span>
        ) : null}
      </div>
    </section>
  );
}
