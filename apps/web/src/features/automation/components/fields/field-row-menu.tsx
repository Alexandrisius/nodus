import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import type { CustomFieldDefinition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import type { RowMenuItem } from '../../../../shared/views/row-menu.js';

/**
 * Меню «шашки» строки реестра атрибутов — полный набор команд (канон меню
 * строки, вердикт 25.10.2026): «Изменить», порядок в карточке («Поднять
 * выше» / «Опустить ниже» — крайним строкам лишний пункт не показываем),
 * видимость и «Удалить». Без права `custom_field.manage` меню пустое:
 * строка открывает окно атрибута только для просмотра.
 */
export function fieldRowMenu({
  row,
  index,
  total,
  canManage,
  onEdit,
  onMove,
  onSetHidden,
  onDelete,
}: {
  row: CustomFieldDefinition;
  index: number;
  total: number;
  canManage: boolean;
  onEdit: (row: CustomFieldDefinition) => void;
  onMove: (row: CustomFieldDefinition, delta: -1 | 1) => void;
  onSetHidden: (row: CustomFieldDefinition, hidden: boolean) => void;
  onDelete: (row: CustomFieldDefinition) => void;
}): RowMenuItem[] {
  if (!canManage) return [];
  const items: RowMenuItem[] = [
    {
      id: 'edit',
      icon: <Pencil className="size-3.5" />,
      label: ui.customFields.menu.edit,
      onSelect: () => onEdit(row),
    },
  ];
  if (index > 0) {
    items.push({
      id: 'up',
      icon: <ArrowUp className="size-3.5" />,
      label: ui.customFields.menu.moveUp,
      separatorBefore: true,
      onSelect: () => onMove(row, -1),
    });
  }
  if (index >= 0 && index < total - 1) {
    items.push({
      id: 'down',
      icon: <ArrowDown className="size-3.5" />,
      label: ui.customFields.menu.moveDown,
      separatorBefore: index === 0,
      onSelect: () => onMove(row, 1),
    });
  }
  items.push(
    row.hidden
      ? {
          id: 'show',
          icon: <Eye className="size-3.5" />,
          label: ui.customFields.menu.show,
          separatorBefore: true,
          onSelect: () => onSetHidden(row, false),
        }
      : {
          id: 'hide',
          icon: <EyeOff className="size-3.5" />,
          label: ui.customFields.menu.hide,
          separatorBefore: true,
          onSelect: () => onSetHidden(row, true),
        },
    {
      id: 'delete',
      icon: <Trash2 className="size-3.5" />,
      label: ui.customFields.menu.delete,
      danger: true,
      onSelect: () => onDelete(row),
    },
  );
  return items;
}
