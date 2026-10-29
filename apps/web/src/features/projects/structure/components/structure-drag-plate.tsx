import type { ProjectNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { plural } from '../../../../shared/lib/format.js';
import { NodeLevelGlyph } from '../lib/node-level-icon.js';
import type { DragPayload } from '../lib/use-structure-dnd.js';

/** Плашка DragOverlay дерева структуры: имя узла, название задачи или
 *  «N задач» (мультиселект). */
export function StructureDragPlate({
  active,
  nodes,
  tasks,
}: {
  active: DragPayload;
  nodes: ProjectNode[];
  tasks: { id: string; title: string }[];
}) {
  let text: string;
  if (active.kind === 'node') {
    text = nodes.find((n) => n.id === active.nodeId)?.name ?? '';
  } else if (active.taskIds.length > 1) {
    text = `${active.taskIds.length} ${plural(active.taskIds.length, ui.structure.taskForms)}`;
  } else {
    text = tasks.find((t) => t.id === active.taskIds[0])?.title ?? '';
  }
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-1.5 text-sm shadow-lg">
      {active.kind === 'node' ? <NodeLevelGlyph icon="folder" className="size-3.5" /> : null}
      <span className="max-w-64 truncate">{text}</span>
    </div>
  );
}
