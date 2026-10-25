import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { useDepartmentsList } from '../../api/departments-list.js';
import { CustomFieldValueView, refsById } from '../value-view.js';
import { EditorTrigger, type EditorProps } from './editor-kit.js';

/**
 * Подразделение (управленческое дерево): выбор по id, показ — имя из ссылок
 * детали. Уровень вложенности — отступом, архивные/неактивные приглушены
 * (старое значение читается, новое выбирается только активным).
 */
export function DepartmentEditor(props: EditorProps) {
  const departments = useDepartmentsList();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <EditorTrigger
          variant={props.variant}
          disabled={props.disabled}
          ariaLabel={props.definition.name}
          open={open}
        >
          <CustomFieldValueView
            definition={props.definition}
            value={props.value}
            refs={refsById(props.refs)}
          />
        </EditorTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <div
          className="overflow-y-auto"
          style={{ height: Math.min(Math.max(departments.length, 1), 8) * 32 + 8 }}
          data-no-scrollbar
        >
          {departments.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{ui.common.empty}</p>
          ) : (
            departments.map((department) => {
              const on = props.value === department.id;
              return (
                <button
                  key={department.id}
                  type="button"
                  disabled={!department.isActive}
                  onClick={() => {
                    props.onCommit(department.id, [
                      {
                        kind: 'department',
                        id: department.id,
                        name: department.name,
                        avatarUrl: null,
                        archived: false,
                      },
                    ]);
                    setOpen(false);
                  }}
                  style={{ paddingLeft: 6 + department.depth * 14 }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md py-1.5 pr-1.5 text-left text-sm hover:bg-accent/60',
                    on ? 'text-port' : 'text-secondary-foreground',
                    !department.isActive && 'opacity-50',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{department.name}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
