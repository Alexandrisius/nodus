import { Settings2 } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';

import { useViewFields, type FieldDef } from './use-view-fields.js';

/**
 * Шестерёнка представления (единая для всех модулей): выбор отображаемых
 * полей из реестра модуля + сброс к дефолту. Ширина колонок регулируется
 * ручкой на границе хедера таблицы (ColumnResizer).
 */
export function ViewSettings({ viewKey, defs }: { viewKey: string; defs: FieldDef[] }) {
  const { fields, toggleField, reset } = useViewFields(viewKey, defs);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ui.common.viewSettings}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings2 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{ui.common.viewFields}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {fields.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.id}
              checked={field.visible}
              disabled={field.locked}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => toggleField(field.id, checked === true)}
            >
              {field.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={reset}>{ui.common.resetView}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
