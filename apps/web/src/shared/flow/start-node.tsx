import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Данные терминала «Создание задачи» (старт маршрута). */
export interface StartNodeData extends Record<string, unknown> {
  readOnly: boolean;
}

export type StartFlowNode = Node<StartNodeData, 'start'>;

/**
 * Старт маршрута (реф Jira «Create»): пунктирная пилюля РОВНО h-10 слева от
 * начального статуса, центр — на одной линии с его центром (стрелка прямая).
 * В правке из точки справа тянется связь — так выбирается начальный статус.
 */
export const StartNode = memo(function StartNode({ data }: NodeProps<StartFlowNode>) {
  return (
    <div
      className="flex h-[40px] w-[156px] items-center gap-2 rounded-full border border-dashed border-border px-3 text-muted-foreground"
      title={ui.automation.startNode}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
      <span className="truncate pt-[1px] text-[11px] leading-none font-medium tracking-[0.08em] uppercase">
        {ui.automation.startNode}
      </span>
      <Handle
        id="r"
        type="source"
        position={Position.Right}
        isConnectable={!data.readOnly}
        className={cn('flow-handle', data.readOnly ? 'opacity-0' : 'opacity-60')}
      />
    </div>
  );
});
