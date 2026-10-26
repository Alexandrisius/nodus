import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Данные терминала «Создание задачи» (старт маршрута). */
export interface StartNodeData extends Record<string, unknown> {
  readOnly: boolean;
  /** Выделен узел «Создание» — открыта панель «Окно создания» (#432). */
  selected?: boolean;
}

export type StartFlowNode = Node<StartNodeData, 'start'>;

/**
 * Старт маршрута (реф Jira «Create»): пунктирная пилюля РОВНО h-10 слева от
 * начального статуса, центр — на одной линии с его центром (стрелка прямая).
 * В правке из точки справа тянется связь — так выбирается начальный статус;
 * клик — панель «Окно создания» (#432): форма создания типа.
 *
 * Выделение — сплошное кольцо и тон `foreground`, БЕЗ свечения (вердикт
 * владельца 26.10.2026: свечение — только у текущего статуса задачи, у
 * служебной метки старта его нет). Ховер меняет рамку ТОЛЬКО у невыделенного:
 * класс наведения перебивал кольцо выделения (псевдокласс специфичнее), и
 * выделение «пропадало» под курсором (баг-вердикт 26.10.2026).
 */
export const StartNode = memo(function StartNode({ data }: NodeProps<StartFlowNode>) {
  const selected = data.selected === true;
  return (
    <div
      className={cn(
        'flow-node-card flex h-[40px] w-[156px] items-center gap-2 rounded-full border bg-card px-3 transition-colors',
        !data.readOnly && 'cursor-pointer',
        selected
          ? 'border-ring text-foreground ring-1 ring-ring/30'
          : cn(
              'border-dashed border-border text-muted-foreground',
              !data.readOnly && 'hover:border-input hover:text-foreground',
            ),
      )}
      data-selected={selected ? 'true' : undefined}
      title={ui.automation.startNode}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate pt-[1px] text-[11px] leading-none font-medium tracking-[0.08em] uppercase">
        {ui.automation.startNode}
      </span>
      <Handle
        id="r"
        type="source"
        position={Position.Right}
        isConnectable={!data.readOnly}
        className={cn('flow-port flow-port-used', data.readOnly && 'pointer-events-none')}
      />
    </div>
  );
});
