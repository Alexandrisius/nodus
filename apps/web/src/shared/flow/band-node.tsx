import type { Node } from '@xyflow/react';
import type { TaskSystemState } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Plus } from 'lucide-react';

import { BAND_GEOMETRY } from './band-layout.js';

/** Данные колонки этапа (группа-родитель статусов, канон «Холст схем»). */
export interface BandNodeData extends Record<string, unknown> {
  systemState: TaskSystemState;
  count: number;
  readOnly: boolean;
  onAddStage?: (band: TaskSystemState) => void;
}

export type BandFlowNode = Node<BandNodeData, 'band'>;

const bandLabel: Record<TaskSystemState, string> = {
  backlog: ui.automation.bands.backlog,
  active: ui.automation.bands.active,
  paused: ui.automation.bands.paused,
  done: ui.automation.bands.done,
  closed: ui.automation.bands.closed,
};

/**
 * Колонка этапа холста: всегда пять слева направо, различаются ступенью
 * тона фона, без рамок (заголовок NodeLabel 13px uppercase приглушённый);
 * «+» в заголовке создаёт статус в этапе (доступен настройщику).
 */
export function BandNode({ data }: { data: BandNodeData }) {
  return (
    <div className="group h-full w-full rounded-[14px] bg-muted/50">
      <div
        className="flex items-center justify-between gap-2 px-4"
        style={{ height: BAND_GEOMETRY.headerHeight }}
      >
        <NodeLabel label={bandLabel[data.systemState]} count={data.count} className="truncate" />
        {!data.readOnly ? (
          <button
            type="button"
            aria-label={`${ui.automation.addStage}: ${bandLabel[data.systemState]}`}
            title={`${ui.automation.addStage}: ${bandLabel[data.systemState]}`}
            onClick={() => data.onAddStage?.(data.systemState)}
            className="nodrag rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
