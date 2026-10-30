import { useState } from 'react';
import type { ProjectNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { plural } from '../../../../shared/lib/format.js';
import { nodeOptions } from '../lib/structure-tree.js';

/** Перенос задач в узел / «Без узла» (меню строки задачи и мультиселекта):
 *  выбор цели, сама мутация — bulk set_node у вызывающего. */
export function TaskMoveDialog({
  count,
  nodes,
  onPick,
  onClose,
}: {
  count: number;
  nodes: ProjectNode[];
  onPick: (nodeId: string | null) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('no-node');
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.moveTasksTo}</DialogTitle>
          <DialogDescription>
            {`${count} ${plural(count, ui.structure.taskForms)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <NodeLabel label={ui.structure.moveTasksTo} />
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="no-node">{ui.structure.moveTasksNoNode}</SelectItem>
              {nodeOptions(nodes).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button onClick={() => onPick(target === 'no-node' ? null : target)}>
            {ui.structure.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
