import { useState } from 'react';
import type { NodeLevel, ProjectNode } from '@nodus/contracts';
import { NODE_LIMITS, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { useDeleteNode, useMoveNode, useUpdateNode } from '../api/structure-api.js';
import { NodeLevelGlyph } from '../lib/node-level-icon.js';
import { nodeOptions } from '../lib/structure-tree.js';

/** Переименование узла: имя / шифр / вид уровня (контракт update). */
export function NodeRenameDialog({
  projectId,
  node,
  levels,
  onClose,
}: {
  projectId: string;
  node: ProjectNode;
  levels: NodeLevel[];
  onClose: () => void;
}) {
  const update = useUpdateNode(projectId);
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? '');
  const [levelId, setLevelId] = useState(node.levelId);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const body: Parameters<typeof update.mutate>[0] = { nodeId: node.id };
    if (trimmed !== node.name) body.name = trimmed;
    if (code.trim() !== (node.code ?? '')) body.code = code.trim() || null;
    if (levelId !== node.levelId) body.levelId = levelId;
    if (Object.keys(body).length <= 1) {
      onClose();
      return;
    }
    update.mutate(body, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.rename}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <NodeLabel label={ui.structure.nodeName} />
            <Input
              autoFocus
              value={name}
              maxLength={NODE_LIMITS.nameLength}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <label className="flex flex-col gap-1">
            <NodeLabel label={ui.structure.nodeCode} />
            <Input
              value={code}
              maxLength={NODE_LIMITS.codeLength}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1">
            <NodeLabel label={ui.structure.nodeKind} />
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    <NodeLevelGlyph icon={level.icon} className="size-3.5 shrink-0" />
                    {level.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button disabled={update.isPending || !name.trim()} onClick={submit}>
            {ui.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Перенос узла выбором родителя (меню «Переместить…»); своё поддерево —
 *  недоступно (цикл). Позиция — последним ребёнком (тонкий порядок — DnD). */
export function NodeMoveDialog({
  projectId,
  node,
  nodes,
  onClose,
}: {
  projectId: string;
  node: ProjectNode;
  nodes: ProjectNode[];
  onClose: () => void;
}) {
  const move = useMoveNode(projectId);
  const [parentId, setParentId] = useState<string>('root');
  const options = nodeOptions(nodes, node.id);

  function submit() {
    move.mutate(
      { nodeId: node.id, parentId: parentId === 'root' ? null : parentId },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.moveTitle}</DialogTitle>
          <DialogDescription>{node.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <NodeLabel label={ui.structure.nodeParent} />
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="root">{ui.structure.rootParent}</SelectItem>
              {options.map((option) => (
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
          <Button disabled={move.isPending} onClick={submit}>
            {ui.structure.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Удаление узла: только ПУСТОЙ (непустой — 409 от сервера, тост по коду). */
export function NodeDeleteDialog({
  projectId,
  node,
  onClose,
}: {
  projectId: string;
  node: ProjectNode;
  onClose: () => void;
}) {
  const remove = useDeleteNode(projectId);
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.deleteTitle}</DialogTitle>
          <DialogDescription>{`${node.name}. ${ui.structure.deleteText}`}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(node.id, { onSuccess: onClose })}
          >
            {ui.structure.remove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
