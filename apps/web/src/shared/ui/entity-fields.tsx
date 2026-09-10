import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';

/** Поле инспектора сущности: дескриптор (иконка + метка + рендер значения).
 *  Реестр дескрипторов — точка расширения под кастомные поля из справочника
 *  после MVP (I13/I15): новое поле = +1 запись в реестре сущности. */
export interface EntityFieldDef {
  key: string;
  icon: ReactNode;
  label: string;
  render: () => ReactNode;
}

function readHidden(storageKey: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** Видимость полей сущности: скрытые ключи в localStorage (свой ключ на
 *  сущность: nodus-<entity>-fields-v1), toggle пишет сразу. */
export function useFieldVisibility(storageKey: string) {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => readHidden(storageKey));

  function toggle(key: string) {
    setHiddenKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return { hiddenKeys, toggle };
}

/** Строка поля: «иконка (lucide 3.5, muted) + моно-метка w-44 / значение»
 *  без табличных рамок, ховер-заливка строки. Значения НЕ сокращаются:
 *  на узкой зоне значение переносится под метку (min-w, вердикт владельца). */
export function FieldRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/40">
      <span className="flex w-44 shrink-0 items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span aria-hidden className="shrink-0 opacity-70">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-[160px] flex-1 items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

/**
 * Инспектор полей сущности (референс ClickUp, грамматика «Инструмента»;
 * общий каркас — потребители: карточка задачи, письмо, паспорт проекта,
 * карточка сотрудника): чистые строки полей из реестра, видимость
 * настраивается кнопкой «+ Поле» с чекбоксами (persist localStorage).
 * Сетка на container queries зоны (@container у родителя): узко — 1 колонка,
 * широко — 2; зазор фикс, блок max-w-4xl центрируется (растут отступы).
 */
export function EntityFields({ defs, storageKey }: { defs: EntityFieldDef[]; storageKey: string }) {
  const { hiddenKeys, toggle } = useFieldVisibility(storageKey);
  const visible = defs.filter((d) => !hiddenKeys.includes(d.key));

  return (
    <div className="mx-auto mt-5 grid max-w-4xl grid-cols-1 gap-x-12 gap-y-0.5 @min-[880px]:grid-cols-2">
      {visible.map((def) => (
        <FieldRow key={def.key} icon={def.icon} label={def.label}>
          {def.render()}
        </FieldRow>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className="-mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-left font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:bg-accent/40 hover:text-foreground @min-[880px]:col-span-2">
          <Plus className="size-3.5" strokeWidth={1.75} />
          {ui.common.addField}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {defs.map((def) => (
            <DropdownMenuCheckboxItem
              key={def.key}
              checked={!hiddenKeys.includes(def.key)}
              onCheckedChange={() => toggle(def.key)}
              onSelect={(e) => e.preventDefault()}
            >
              {def.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
