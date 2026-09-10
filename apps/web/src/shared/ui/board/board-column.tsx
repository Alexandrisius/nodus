import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { StageColor } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { stageTone } from './stage-tone.js';

/** Стадия-колонка борда: минимум данных для шапки (имя + цвет тона). */
export interface BoardColumnStage {
  id: string;
  name: string;
  color: StageColor;
}

/**
 * Колонка канбана — общая оболочка борда (потребители: «Мой план» задач,
 * проектная доска): SortableContext карточек + drop-зона стадии (useDroppable,
 * id = stage.id — пустая колонка принимает перенос) + шапка (цветной чип
 * стадии на токенах темы + счётчик + слоты действий) + скролл-зона с
 * sentinel-подгрузкой следующих страниц. Контент карточек — children
 * (render-проп потребителя). CRUD колонки (меню, переименование) — слоты:
 * у проектной доски колоночного CRUD нет (стадии правятся в редакторе схем).
 * Наведение переноса — подсветка плоскостью (over === колонка ИЛИ over ∈ её
 * карточки: collision резолвит over в карточку, не в колонку).
 */
export function BoardColumn({
  stage,
  count,
  cardIds,
  hasNext,
  loadingMore,
  onLoadMore,
  chipOverride,
  headerActions,
  quickAdd,
  emptyLabel,
  dropLabel,
  children,
}: {
  stage: BoardColumnStage;
  count: number;
  cardIds: string[];
  hasNext: boolean;
  loadingMore: boolean;
  onLoadMore: (stageId: string) => void;
  /** Замена чипа стадии (инлайн-инпут переименования потребителя). */
  chipOverride?: ReactNode;
  /** Слот действий шапки справа (меню «⋯» потребителя). */
  headerActions?: ReactNode;
  /** Быстрое создание карточки: плюсик в шапке + инлайн-инпут в топе зоны. */
  quickAdd?: {
    placeholder: string;
    addButtonLabel: string;
    onCreate: (stageId: string, title: string) => void;
  };
  emptyLabel: string;
  dropLabel: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { over } = useDndContext();
  const overInColumn = isOver || (over !== null && cardIds.includes(String(over.id)));
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [draft, setDraft] = useState('');
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

  function commitDraft() {
    const title = draft.trim();
    setAddingCard(false);
    setDraft('');
    if (title && quickAdd) quickAdd.onCreate(stage.id, title);
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
        {chipOverride ?? (
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
        {quickAdd ? (
          <button
            type="button"
            aria-label={quickAdd.addButtonLabel}
            title={quickAdd.addButtonLabel}
            onClick={() => setAddingCard(true)}
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
        {headerActions}
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-0.5 pt-1 pb-2"
        >
          {addingCard && quickAdd ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDraft();
                if (e.key === 'Escape') {
                  setAddingCard(false);
                  setDraft('');
                }
              }}
              onBlur={commitDraft}
              placeholder={quickAdd.placeholder}
              className="h-9 shrink-0 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus:border-ring"
            />
          ) : null}
          {children}
          {count === 0 && !loadingMore ? (
            <span className="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
              {overInColumn ? dropLabel : emptyLabel}
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
