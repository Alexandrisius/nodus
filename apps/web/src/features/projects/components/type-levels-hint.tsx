/**
 * НЕ ПОДКЛЮЧЁН (#467): редактор видов-подсказок убран из «Типов проектов»,
 * виды узлов настраиваются в карточке проекта. Файл остаётся до переделки
 * «Типов проектов» отдельным issue вместе с полем `levelKindIds`.
 */
import { ListTree } from 'lucide-react';
import type { ProjectType } from '@nodus/contracts';
import { NODE_LIMITS, ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';

import { useNodeLevels } from '../structure/api/node-levels-api.js';

/**
 * Виды-подсказки структуры в строке типа проекта (#467, вердикт владельца
 * 30.10): НЕ жёсткий порядок уровней — только подсказка дефолтного вида узла
 * при создании. Мультиселект ≤ NODE_LIMITS.levelKindsPerType; null — «Не заданы».
 */
export function TypeLevelsHint({
  type,
  onApply,
}: {
  type: ProjectType;
  onApply: (levelKindIds: string[] | null) => void;
}) {
  const { data: levels } = useNodeLevels();
  const active = (levels ?? []).filter((level) => level.archivedAt === null);
  const selected = type.levelKindIds ?? [];

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((entry) => entry !== id)
      : [...selected, id];
    onApply(next.length > 0 ? next.slice(0, NODE_LIMITS.levelKindsPerType) : null);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ui.structure.typeHintTitle}
        title={ui.structure.typeHintTitle}
        className="flex h-7 w-40 shrink-0 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ListTree className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className={cn('truncate', selected.length === 0 && 'opacity-70')}>
          {selected.length > 0
            ? `${ui.structure.typeHintTitle}: ${selected.length}`
            : ui.structure.typeHintNone}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {active.map((level) => (
          <DropdownMenuCheckboxItem
            key={level.id}
            checked={selected.includes(level.id)}
            onCheckedChange={() => toggle(level.id)}
            onSelect={(event) => event.preventDefault()}
          >
            {level.name}
          </DropdownMenuCheckboxItem>
        ))}
        {active.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{ui.structure.levelsEmpty}</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
