import { useState } from 'react';
import { Archive, Check, Pencil, Plus, X } from 'lucide-react';
import type { NodeLevel, NodeLevelIcon, ProjectColor } from '@nodus/contracts';
import { projectColorSchema, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { identityTone } from '../../../shared/ui/identity-tone.js';
import {
  useArchiveNodeLevel,
  useCreateNodeLevel,
  useNodeLevels,
  useUpdateNodeLevel,
} from '../structure/api/node-levels-api.js';
import { NODE_LEVEL_ICON_KEYS, NodeLevelGlyph } from '../structure/lib/node-level-icon.js';

/** Селект значка вида уровня: глиф + ключ enum (I15: ключи закрыты контрактом). */
function IconSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: NodeLevelIcon;
  onChange: (icon: NodeLevelIcon) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as NodeLevelIcon)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-24 shrink-0 text-xs" aria-label={label} title={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-64">
        {NODE_LEVEL_ICON_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            <NodeLevelGlyph icon={key} className="size-3.5 shrink-0" />
            {key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Селект цвета вида уровня: свотч + название (ru-structure.colorNames). */
function ColorSelect({
  value,
  onChange,
  disabled,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ProjectColor)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-32 shrink-0 text-xs" aria-label={ui.structure.fieldColor}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {projectColorSchema.options.map((color) => (
          <SelectItem key={color} value={color}>
            <span
              aria-hidden
              className={cn('size-3 shrink-0 rounded-full', identityTone[color].dot)}
            />
            {ui.structure.colorNames[color]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * «Автоматизация → Типы проектов → Виды уровней» (#467): справочник ярлыков
 * узлов (значок + цвет). Архив — не удаление: узлы архивного вида живут,
 * новые создавать нельзя. Функциональная механика; визуал — UI-агент.
 */
export function NodeLevelsSection({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useNodeLevels(true);
  const create = useCreateNodeLevel();
  const update = useUpdateNodeLevel();
  const archive = useArchiveNodeLevel();

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    icon: 'folder' as NodeLevelIcon,
    color: 'blue' as ProjectColor,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const levels: NodeLevel[] = data ?? [];

  function submitCreate() {
    const name = draft.name.trim();
    if (!name) return;
    create.mutate(
      { name, icon: draft.icon, color: draft.color },
      {
        onSuccess: () => {
          setDraft({ name: '', icon: 'folder', color: 'blue' });
          setCreating(false);
        },
      },
    );
  }

  function submitRename(level: NodeLevel) {
    const name = editName.trim();
    setEditingId(null);
    if (name && name !== level.name) update.mutate({ id: level.id, name });
  }

  return (
    <section className="node-panel flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <NodeLabel label={ui.structure.levelsTitle} count={levels.length} />
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto text-muted-foreground"
            onClick={() => setCreating((prev) => !prev)}
          >
            <Plus className="size-3" strokeWidth={1.75} />
            {ui.structure.levelsCreate}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
            placeholder={ui.structure.levelsNamePlaceholder}
            aria-label={ui.structure.levelsCreate}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <IconSelect
            value={draft.icon}
            onChange={(icon) => setDraft((prev) => ({ ...prev, icon }))}
            label={ui.structure.fieldIcon}
          />
          <ColorSelect
            value={draft.color}
            onChange={(color) => setDraft((prev) => ({ ...prev, color }))}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={ui.common.create}
            onClick={submitCreate}
            disabled={!draft.name.trim()}
          >
            <Check className="size-3.5" strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={ui.common.cancel}
            onClick={() => {
              setCreating(false);
              setDraft({ name: '', icon: 'folder', color: 'blue' });
            }}
          >
            <X className="size-3.5" strokeWidth={2} />
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : levels.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted-foreground">{ui.structure.levelsEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {levels.map((level) => (
            <li
              key={level.id}
              className="group flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent/40"
            >
              {editingId === level.id ? (
                <>
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(level);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={level.name}
                    className="h-7 min-w-0 flex-1 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={ui.common.save}
                    onClick={() => submitRename(level)}
                  >
                    <Check className="size-3.5" strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={ui.common.cancel}
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </Button>
                </>
              ) : (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded border',
                      identityTone[level.color].tile,
                    )}
                  >
                    <NodeLevelGlyph icon={level.icon} className="size-3.5" />
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      level.archivedAt !== null && 'text-muted-foreground line-through',
                    )}
                  >
                    {level.name}
                  </span>
                  {level.archivedAt !== null ? (
                    <NodeChip tone="muted">{ui.projects.status.archived}</NodeChip>
                  ) : null}
                  {canManage && level.archivedAt === null ? (
                    <>
                      <IconSelect
                        value={level.icon}
                        onChange={(icon) => update.mutate({ id: level.id, icon })}
                        label={`${ui.structure.fieldIcon}: ${level.name}`}
                      />
                      <ColorSelect
                        value={level.color}
                        onChange={(color) => update.mutate({ id: level.id, color })}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={ui.projects.editProject}
                        title={ui.structure.rename}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          setEditingId(level.id);
                          setEditName(level.name);
                        }}
                      >
                        <Pencil className="size-3.5" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={ui.structure.levelsArchive}
                        title={ui.structure.levelsArchive}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        onClick={() => archive.mutate(level.id)}
                      >
                        <Archive className="size-3.5" strokeWidth={1.75} />
                      </Button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
