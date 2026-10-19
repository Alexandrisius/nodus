import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Данные терминала «Создание задачи» (старт маршрута). */
export interface StartNodeData extends Record<string, unknown> {
  /** Клик по терминалу выбирает начальный статус. */
  onSelect?: () => void;
  active: boolean;
}

export type StartFlowNode = Node<StartNodeData, 'start'>;

/**
 * Старт маршрута (реф Jira «Create»): компактная пунктирная пилюля слева от
 * начального статуса; клик выбирает начальный статус.
 */
export const StartNode = memo(function StartNode({ data }: NodeProps<StartFlowNode>) {
  const interactive = data.onSelect !== undefined;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={data.onSelect}
      className={cn(
        'nodrag flex h-10 w-[128px] items-center gap-2 rounded-full border border-dashed px-3 text-left transition-colors',
        data.active
          ? 'border-ring bg-accent text-foreground ring-1 ring-ring/30'
          : 'border-border bg-transparent text-muted-foreground',
        interactive && 'hover:border-input hover:text-foreground',
      )}
      title={ui.automation.startNode}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
      <span className="truncate text-[11px] font-medium uppercase leading-none tracking-[0.08em] pt-[1px]">
        {ui.automation.startNode}
      </span>
      {/* Якорь ребра в начальный статус (невидимый порт справа). */}
      <Handle id="r" type="source" position={Position.Right} className="invisible" />
    </button>
  );
});
