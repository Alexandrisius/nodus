import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type {
  StageColor,
  StageOutcome,
  TaskSystemState,
  TransitionDisplay,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Check, CircleAlert, X } from 'lucide-react';

import { stageTone } from '../ui/board/stage-tone.js';
import { AnyFromPill } from './any-status-pill.js';

/** Данные узла статуса на холсте схем (#378). */
export interface StatusNodeData extends Record<string, unknown> {
  name: string;
  color: StageColor;
  systemState: TaskSystemState;
  isInitial: boolean;
  outcome: StageOutcome | null;
  /** Есть проблема схемы на этом статусе (бейдж). */
  hasProblem: boolean;
  /** Текущий статус задачи («Схема маршрута») — свечение. */
  current?: boolean;
  readOnly: boolean;
  /** Кнопки «из любого» в эту стадию (пилюли над карточкой). */
  pills: readonly { id: string; name: string; display: TransitionDisplay }[];
  /** События узла (выбор/клик по пилюле) — пробрасывает потребитель. */
  onSelectTransition?: (id: string) => void;
}

export type StatusFlowNode = Node<StatusNodeData, 'status'>;

const bandLabel: Record<TaskSystemState, string> = {
  backlog: ui.automation.bands.backlog,
  active: ui.automation.bands.active,
  paused: ui.automation.bands.paused,
  done: ui.automation.bands.done,
  closed: ui.automation.bands.closed,
};

/** Порты с четырёх сторон — видны на наведении у настройщика (r=3). */
const HANDLES: readonly { id: string; position: Position }[] = [
  { id: 'l', position: Position.Left },
  { id: 'r', position: Position.Right },
  { id: 't', position: Position.Top },
  { id: 'b', position: Position.Bottom },
];

/**
 * Узел статуса маршрута (канон «Холст схем»): карточка ~200×56 — точка
 * цвета + название; маркеры справа: начальный, итог (✓/✕), бейдж проблемы.
 * Выбранный — кольцо и свечение (свечение только у активного узла).
 */
export const StatusNode = memo(function StatusNode({
  id,
  data,
  selected,
}: NodeProps<StatusFlowNode>) {
  const tone = stageTone[data.color];
  const active = selected || data.current;
  return (
    <div className="group relative" data-status-id={id}>
      {/* Пилюли «из любого» стопкой над карточкой. */}
      {data.pills.length > 0 ? (
        <div className="absolute bottom-full left-0 right-0 z-1 mb-1.5 flex flex-col items-start gap-1">
          {data.pills.map((pill) => (
            <AnyFromPill
              key={pill.id}
              name={pill.name}
              active={pill.display === 'primary'}
              onClick={data.readOnly ? undefined : () => data.onSelectTransition?.(pill.id)}
            />
          ))}
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${ui.automation.stageAria} «${data.name}», ${ui.automation.bandAria} «${bandLabel[data.systemState]}»`}
        className={cn(
          'flex h-14 w-[200px] items-center gap-2 rounded-[10px] border bg-card px-3 transition-colors',
          active ? 'border-ring ring-1 ring-ring/30 drop-shadow-(--glow)' : 'border-border',
        )}
      >
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
        <span className="min-w-0 flex-1 truncate text-sm" title={data.name}>
          {data.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {data.isInitial ? (
            <span
              className="text-[10px] font-medium uppercase tracking-[0.08em]"
              title={ui.automation.initialMark}
            >
              {ui.automation.initialMark}
            </span>
          ) : null}
          {data.outcome === 'success' ? (
            <Check className="size-3.5" aria-label={ui.automation.outcomeSuccess} />
          ) : data.outcome === 'cancelled' ? (
            <X className="size-3.5" aria-label={ui.automation.outcomeCancelled} />
          ) : null}
          {data.hasProblem ? <CircleAlert className="size-3.5 text-danger" aria-hidden /> : null}
        </span>
      </div>
      {/* Порты — всегда в DOM: это якоря рёбер React Flow (координаты
          считаются по Handle); видны на наведении у настройщика. */}
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className={cn(
            'transition-opacity',
            data.readOnly
              ? 'pointer-events-none opacity-0'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        />
      ))}
    </div>
  );
});
