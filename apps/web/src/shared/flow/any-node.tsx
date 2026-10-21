import { memo } from 'react';
import { Handle, type Node, type NodeProps } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { SIDE_POSITION } from './flow-handles.js';

/** Данные метки «Любой статус» — кнопки из любого статуса (#378 ред. 2). */
export interface AnyNodeData extends Record<string, unknown> {
  transitionId: string;
  readOnly: boolean;
  /** Точка, из которой выходит стрелка в статус (кружок, как у статусов). */
  port?: string | null;
  /** Стрелка метки выделена — точка подсвечена. */
  portSelected?: boolean;
}

export type AnyFlowNode = Node<AnyNodeData, 'any'>;

/**
 * Метка «Любой статус» (реф Jira/Трекер): пунктирная пилюля со стрелкой в
 * статус — кнопка `fromStageId = null`, подпись кнопки — на стрелке. В
 * правке перетаскивается (место — общая раскладка); выделение метки =
 * выделение её кнопки. Точки подключения служебные: соединять нельзя.
 */
export const AnyNode = memo(function AnyNode({ selected, data }: NodeProps<AnyFlowNode>) {
  return (
    <div
      className={cn(
        'flow-node-card flex h-[28px] w-[128px] items-center justify-center rounded-full border border-dashed bg-card px-3 transition-colors',
        selected
          ? 'border-primary text-foreground ring-1 ring-primary/30'
          : 'border-input text-muted-foreground',
      )}
      title={ui.automation.anyStatus}
    >
      <span className="truncate pt-[1px] text-[11px] leading-none font-medium tracking-[0.06em] uppercase">
        {ui.automation.anyStatus}
      </span>
      {(['t', 'r', 'b', 'l'] as const).map((side) => (
        <Handle
          key={side}
          id={`${side}2`}
          type="source"
          position={SIDE_POSITION[side]}
          isConnectable={false}
          className={
            data.port === `${side}2`
              ? cn(
                  'flow-port flow-port-used pointer-events-none',
                  data.portSelected && 'flow-port-selected',
                )
              : 'invisible'
          }
        />
      ))}
    </div>
  );
});
