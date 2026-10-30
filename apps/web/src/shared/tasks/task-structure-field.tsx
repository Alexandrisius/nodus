import { Folder } from 'lucide-react';
import type { ProjectNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { projectNodePathOptions } from '../api/project-structure.js';

/** Поле «Структура» окна создания задачи (#467): путь узла («Здание 1 / АР /
 *  Комплект АР-1»), ширина на две колонки — как «Описание». Показывается,
 *  только когда у выбранного проекта уже есть узлы; без узла проект не
 *  привязать (иначе задачи копятся в «Без узла»). */
export function TaskStructureField({
  nodes,
  value,
  required,
  onChange,
}: {
  nodes: ProjectNode[];
  value: string | null;
  required: boolean;
  onChange: (nodeId: string) => void;
}) {
  const options = projectNodePathOptions(nodes);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <NodeLabel label={ui.structure.taskNodeLabel} />
        {required ? (
          <span aria-hidden className="text-label leading-none text-danger">
            *
          </span>
        ) : null}
      </div>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={ui.structure.taskNodeLabel}>
          <SelectValue placeholder={ui.structure.taskNodePlaceholder} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <Folder className="size-3.5 shrink-0" strokeWidth={1.75} />
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
