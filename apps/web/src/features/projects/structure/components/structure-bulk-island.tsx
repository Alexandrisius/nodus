import { ArrowRightLeft, FolderInput } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { BulkIsland, bulkActionClass } from '../../../../shared/views/bulk-island.js';

/** Островок массовых действий структуры: пачка задач — «Переместить в узел»,
 *  пачка узлов — «Переместить». Каркас общий (`shared/views/bulk-island`),
 *  действия — только реальные. */
export function StructureBulkIsland({
  selectedNodeIds,
  selectedTaskIds,
  pending,
  onClear,
  onMoveTasks,
  onMoveNodes,
}: {
  selectedNodeIds: readonly string[];
  selectedTaskIds: readonly string[];
  pending: boolean;
  onClear: () => void;
  onMoveTasks: (taskIds: string[]) => void;
  onMoveNodes: (nodeIds: string[]) => void;
}) {
  const count = selectedNodeIds.length + selectedTaskIds.length;
  return (
    <BulkIsland
      visible={count > 0}
      count={count}
      ariaLabel={ui.structure.tab}
      pending={pending}
      onClear={onClear}
    >
      {selectedTaskIds.length > 0 ? (
        <button
          type="button"
          className={bulkActionClass}
          onClick={() => onMoveTasks([...selectedTaskIds])}
        >
          <ArrowRightLeft className="size-4" strokeWidth={1.75} />
          {ui.structure.moveTasksTo}
        </button>
      ) : null}
      {selectedNodeIds.length > 0 ? (
        <button
          type="button"
          className={bulkActionClass}
          onClick={() => onMoveNodes([...selectedNodeIds])}
        >
          <FolderInput className="size-4" strokeWidth={1.75} />
          {ui.structure.move}
        </button>
      ) : null}
    </BulkIsland>
  );
}
