import { useMemo, useState } from 'react';
import type { NodeLevel, ProjectNode } from '@nodus/contracts';
import { NODE_LIMITS, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
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

import { useBatchCreateNodes, useCreateNode } from '../api/structure-api.js';
import { NodeLevelGlyph } from '../lib/node-level-icon.js';

/** Селект вида уровня: значок + имя (ярлык узла, вердикт владельца 30.10). */
function LevelSelect({
  levels,
  value,
  onChange,
}: {
  levels: NodeLevel[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ui.structure.nodeKind} className="w-full">
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
  );
}

/**
 * Окно создания узла («Создать узел» тулбара / «Создать узел внутри» меню):
 * название, шифр, вид уровня; родитель задан входом (null — корень проекта).
 */
export function NodeCreateDialog({
  projectId,
  parent,
  levels,
  onClose,
}: {
  projectId: string;
  parent: ProjectNode | null;
  levels: NodeLevel[];
  onClose: () => void;
}) {
  const active = levels.filter((level) => level.archivedAt === null);
  const create = useCreateNode(projectId);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [levelId, setLevelId] = useState(active[0]?.id ?? '');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || !levelId) return;
    create.mutate(
      {
        parentId: parent?.id ?? null,
        levelId,
        name: trimmed,
        ...(code.trim() ? { code: code.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.createNode}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <NodeLabel
              label={
                parent ? `${ui.structure.nodeParent}: ${parent.name}` : ui.structure.rootParent
              }
            />
          </label>
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
            <LevelSelect levels={active} value={levelId} onChange={setLevelId} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button disabled={create.isPending || !name.trim() || !levelId} onClick={submit}>
            {ui.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Пакетное создание («Здания: поз. 1–3»): общее название + диапазон номеров,
 * имена «{префикс} {i}» собирает клиент (контракт batch), предпросмотр.
 */
export function NodeBatchCreateDialog({
  projectId,
  parent,
  levels,
  onClose,
}: {
  projectId: string;
  parent: ProjectNode | null;
  levels: NodeLevel[];
  onClose: () => void;
}) {
  const active = levels.filter((level) => level.archivedAt === null);
  const batch = useBatchCreateNodes(projectId);
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('3');
  const [levelId, setLevelId] = useState(active[0]?.id ?? '');

  const names = useMemo(() => {
    const start = Number.parseInt(from, 10);
    const end = Number.parseInt(to, 10);
    if (!prefix.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return [];
    return Array.from({ length: end - start + 1 }, (_, i) => `${prefix.trim()} ${start + i}`).slice(
      0,
      NODE_LIMITS.batch,
    );
  }, [prefix, from, to]);

  function submit() {
    if (names.length === 0 || !levelId) return;
    batch.mutate({ parentId: parent?.id ?? null, levelId, names }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ui.structure.createNodesBatch}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <NodeLabel label={ui.structure.batchPrefix} />
            <Input autoFocus value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <NodeLabel label={ui.structure.batchFrom} />
              <Input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <NodeLabel label={ui.structure.batchTo} />
              <Input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <NodeLabel label={ui.structure.nodeKind} />
            <LevelSelect levels={active} value={levelId} onChange={setLevelId} />
          </div>
          {names.length > 0 ? (
            <div className="flex flex-col gap-1">
              <NodeLabel label={`${ui.structure.batchPreview}: ${names.length}`} />
              <ul className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
                {names.map((n) => (
                  <li key={n} className="truncate">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button disabled={batch.isPending || names.length === 0 || !levelId} onClick={submit}>
            {ui.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
