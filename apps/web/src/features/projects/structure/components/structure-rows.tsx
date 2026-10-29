import { ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { NodeLevel } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { cn } from '@nodus/ui/lib/utils';

import { formatDate, formatMinutes } from '../../../../shared/lib/format.js';
import { DeadlineChip } from '../../../../shared/ui/deadline-chip.js';
import { identityTone } from '../../../../shared/ui/identity-tone.js';
import { monoCell, PersonCell } from '../../../../shared/ui/person-cell.js';
import { TaskStatusBadge } from '../../../../shared/ui/task-status-badge.js';
import { RowMenu, type RowMenuItem } from '../../../../shared/views/row-menu.js';
import { NodeLevelGlyph } from '../lib/node-level-icon.js';
import type { StructureNodeRow, StructureTaskRow } from '../lib/structure-tree.js';
import { NO_NODE_DROP_ID, type DragPayload } from '../lib/use-structure-dnd.js';
import { StructureContextMenu } from './structure-menus.js';

/** Строки таблицы структуры: узел-папка, задача-лист и секция «Без узла».
 *  Контур вложенности упрощён до отступов (визуал — UI-агент); DnD-строки
 *  статичны, индикация дропа — линия вставки + подсветка папки. */

const INDENT = 20;

const combineRefs =
  (...refs: ((el: HTMLElement | null) => void)[]) =>
  (el: HTMLElement | null) => {
    for (const ref of refs) ref(el);
  };

/** Подсветка папки при дропе «внутрь» (классы-заглушки, визуал — UI-агент). */
const dropIndication = (zone: string | null, invalid: boolean) =>
  zone && !invalid && zone === 'into' ? 'bg-accent/50' : '';

function InsertLine({ zone }: { zone: 'before' | 'after' | null }) {
  if (!zone) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-1 z-10 h-0.5 bg-port',
        zone === 'before' ? 'top-0' : 'bottom-0',
      )}
    />
  );
}

const EmptyCell = () => <span aria-hidden>—</span>;

export function StructureNodeRowView({
  row,
  level,
  collapsed,
  onToggle,
  items,
  zone,
  invalid,
  isDragging,
  grid,
}: {
  row: StructureNodeRow;
  level: NodeLevel | undefined;
  collapsed: boolean;
  onToggle: () => void;
  items: RowMenuItem[];
  /** Зона дропа над этой строкой (индикация). */
  zone: 'before' | 'into' | 'after' | null;
  invalid: boolean;
  isDragging: boolean;
  grid: { templateColumns: string };
}) {
  const drag = useDraggable({
    id: `node:${row.node.id}`,
    data: { kind: 'node', nodeId: row.node.id },
  });
  const drop = useDroppable({ id: `node:${row.node.id}` });
  const tone = level
    ? identityTone[level.color].tile
    : 'border-border bg-accent/40 text-muted-foreground';
  const style: CSSProperties = { gridTemplateColumns: grid.templateColumns };

  return (
    <StructureContextMenu items={items}>
      <div
        ref={combineRefs(drag.setNodeRef, drop.setNodeRef)}
        {...drag.attributes}
        {...drag.listeners}
        role="row"
        tabIndex={0}
        aria-expanded={row.hasChildren ? !collapsed : undefined}
        style={style}
        className={cn(
          'group/row relative grid h-12 w-max min-w-full cursor-grab items-stretch gap-3 border-b border-border/60 px-4 transition-colors [contain-intrinsic-size:auto_3rem] [content-visibility:auto] hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring',
          isDragging && 'opacity-40',
          dropIndication(zone, invalid),
        )}
      >
        <InsertLine zone={zone === 'before' || zone === 'after' ? zone : null} />
        <span
          role="cell"
          className="flex items-center"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <RowMenu items={items} />
        </span>
        <span
          role="cell"
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: row.depth * INDENT }}
        >
          {row.hasChildren ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggle}
              aria-label={collapsed ? ui.structure.expandAll : ui.structure.collapseAll}
              className="flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight
                className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
                strokeWidth={1.75}
              />
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <span
            aria-hidden
            className={cn('flex size-6 shrink-0 items-center justify-center rounded border', tone)}
            title={level?.name}
          >
            <NodeLevelGlyph icon={level?.icon ?? 'folder'} className="size-3.5" />
          </span>
          <span className="truncate text-sm font-medium">{row.node.name}</span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          {row.node.code ? <span className={monoCell}>{row.node.code}</span> : <EmptyCell />}
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>{formatMinutes(row.subtree.plannedMinutes)}</span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>{formatMinutes(row.subtree.spentMinutes)}</span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>
            {row.subtree.nearestDeadline ? formatDate(row.subtree.nearestDeadline) : '—'}
          </span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>
            {row.subtree.latestDeadline ? formatDate(row.subtree.latestDeadline) : '—'}
          </span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>
            {row.subtree.doneCount}/{row.subtree.taskCount}
          </span>
        </span>
      </div>
    </StructureContextMenu>
  );
}

export function StructureTaskRowView({
  row,
  selected,
  onToggleSelected,
  items,
  onOpen,
  dragData,
  isDragging,
  grid,
}: {
  row: StructureTaskRow;
  selected: boolean;
  onToggleSelected: () => void;
  items: RowMenuItem[];
  onOpen: (anchor: HTMLElement) => void;
  /** Мультиселект: за строкой тянется вся выборка. */
  dragData: DragPayload;
  isDragging: boolean;
  grid: { templateColumns: string };
}) {
  const drag = useDraggable({ id: `task:${row.task.id}`, data: dragData });
  const style: CSSProperties = { gridTemplateColumns: grid.templateColumns };
  const { task } = row;
  return (
    <StructureContextMenu items={items}>
      <div
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        role="row"
        tabIndex={0}
        onClick={(e) => onOpen(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(e.currentTarget);
          }
        }}
        style={style}
        className={cn(
          'group/row grid h-12 w-max min-w-full cursor-pointer items-stretch gap-3 border-b border-border/60 px-4 transition-colors [contain-intrinsic-size:auto_3rem] [content-visibility:auto] hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring',
          selected && 'bg-accent/50',
          isDragging && 'opacity-40',
        )}
      >
        <span
          role="cell"
          className="flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={ui.common.selectRow}
          />
          <RowMenu items={items} />
        </span>
        <span
          role="cell"
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: row.depth * INDENT }}
        >
          <span className={monoCell}>{task.number}</span>
          <span className="truncate text-sm">{task.title}</span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <TaskStatusBadge stage={task.stage} />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <PersonCell user={task.assignee} />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <DeadlineChip deadline={task.deadline} state={task.stage.systemState} />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <span className={monoCell}>
            {task.spentMinutes > 0 ? formatMinutes(task.spentMinutes) : '—'}
          </span>
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
        <span role="cell" className="flex min-w-0 items-center">
          <EmptyCell />
        </span>
      </div>
    </StructureContextMenu>
  );
}

/** Секция «Без узла» внизу дерева: заголовок + droppable-строка для задач. */
export function StructureNoNodeRowView({
  count,
  dropActive,
}: {
  count: number;
  dropActive: boolean;
}) {
  const drop = useDroppable({ id: NO_NODE_DROP_ID });
  return (
    <div
      ref={drop.setNodeRef}
      className={cn(
        'flex h-10 w-max min-w-full items-center gap-2 border-b border-border/60 px-4 text-muted-foreground transition-colors',
        dropActive && 'bg-accent/50',
      )}
    >
      <span className="text-sm font-medium">{ui.structure.noNodeSection}</span>
      <span className="font-mono text-label-sm tabular-nums">{count}</span>
      <span className="truncate text-label-sm">{ui.structure.noNodeHint}</span>
    </div>
  );
}
