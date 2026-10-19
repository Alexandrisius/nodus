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
 * Терминал старта слева от первой колонки: «Создание задачи», стрелка в
 * начальный статус рисуется ребром; клик выбирает начальный статус.
 */
export const StartNode = memo(function StartNode({ data }: NodeProps<StartFlowNode>) {
  const interactive = data.onSelect !== undefined;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={data.onSelect}
      className={cn(
        'nodrag rounded-[10px] border px-3 py-2 text-left transition-colors',
        data.active
          ? 'border-ring bg-accent text-foreground ring-1 ring-ring/30'
          : 'border-dashed border-border bg-transparent text-muted-foreground',
        interactive && 'hover:border-input hover:text-foreground',
      )}
      title={ui.automation.startNode}
    >
      <span className="block text-[10px] font-medium uppercase tracking-[0.08em] opacity-70">
        {ui.automation.startNode}
      </span>
      {/* Якорь ребра в начальный статус (невидимый порт справа). */}
      <Handle id="r" type="source" position={Position.Right} className="invisible" />
    </button>
  );
});
