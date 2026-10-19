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

/** Данные узла статуса на холсте маршрута (#378). */
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

const stateLabel: Record<TaskSystemState, string> = {
  backlog: ui.automation.bands.backlog,
  active: ui.automation.bands.active,
  paused: ui.automation.bands.paused,
  done: ui.automation.bands.done,
  closed: ui.automation.bands.closed,
};

/** Порты с четырёх сторон — всегда в DOM (якоря рёбер); видны на наведении
 *  у настройщика (r=3, канон связей). */
const HANDLES: readonly { id: string; position: Position }[] = [
  { id: 'l', position: Position.Left },
  { id: 'r', position: Position.Right },
  { id: 't', position: Position.Top },
  { id: 'b', position: Position.Bottom },
];

/**
 * Узел статуса маршрута: карточка 208×52 с цветной полосой слева (цвет
 * статуса), названием и подписью этапа; маркеры справа — начальный, итог
 * (✓/✕), бейдж проблемы. Выбранный — кольцо, текущий статус задачи —
 * свечение (только у активного узла).
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
      {/* Пилюли «из любого» стопкой над карточкой (правый край). */}
      {data.pills.length > 0 ? (
        <div className="absolute bottom-full right-0 z-1 mb-1.5 flex flex-col items-end gap-1">
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
        style={active ? { filter: 'drop-shadow(0 0 6px var(--glow))' } : undefined}
        aria-label={`${ui.automation.stageAria} «${data.name}», ${ui.automation.bandAria} «${stateLabel[data.systemState]}»`}
        className={cn(
          'flex h-[52px] w-[208px] items-stretch overflow-hidden rounded-[10px] border bg-card transition-colors',
          active
            ? 'border-ring ring-1 ring-ring/30 drop-shadow(0 0 6px var(--glow))'
            : 'border-border',
        )}
      >
        <span aria-hidden className={cn('w-1 shrink-0', tone.dot)} />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2">
          <span
            className="truncate text-[13px] font-medium leading-none pt-[1px]"
            title={data.name}
          >
            {data.name}
          </span>
          <span className="truncate text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
            {stateLabel[data.systemState]}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end justify-center gap-1 pr-2.5">
          {data.isInitial ? (
            <span
              className="text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground"
              title={ui.automation.initialMark}
            >
              {ui.automation.initialMark}
            </span>
          ) : null}
          <span className="flex items-center gap-1 text-muted-foreground">
            {data.outcome === 'success' ? (
              <Check className="size-3.5 text-success" aria-label={ui.automation.outcomeSuccess} />
            ) : data.outcome === 'cancelled' ? (
              <X className="size-3.5 text-danger" aria-label={ui.automation.outcomeCancelled} />
            ) : null}
            {data.hasProblem ? <CircleAlert className="size-3.5 text-danger" aria-hidden /> : null}
          </span>
        </span>
      </div>
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
