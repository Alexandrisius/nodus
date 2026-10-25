import { Archive, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { CounterpartyListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import type { RowMenuItem } from '../../../shared/views/row-menu.js';

/**
 * Меню «шашки» строки реестра контрагентов — ПОЛНЫЙ набор команд сущности
 * (канон меню строки, вердикт владельца 25.10.2026): базовые «Открыть» и
 * «Копировать ссылку», затем доменные — «Изменить», «В перенести архив» /
 * «Вернуть из архива» и «Удалить». Состав — по правам (`crm.manage`):
 * без права меню остаётся базовым (сервер всё равно отклонит, I8).
 */
export function counterpartyRowMenu({
  row,
  openCard,
  canManage,
  onEdit,
  onArchive,
  onDelete,
}: {
  row: CounterpartyListItem;
  openCard: (ref: { kind: 'counterparty'; id: string }) => void;
  canManage: boolean;
  onEdit: (row: CounterpartyListItem) => void;
  onArchive: (row: CounterpartyListItem, archived: boolean) => void;
  onDelete: (row: CounterpartyListItem) => void;
}): RowMenuItem[] {
  const base = makeCardRowMenuItems({ kind: 'counterparty', id: row.id }, openCard);
  if (!canManage) return base;
  const archived = row.archivedAt !== null;
  return [
    ...base,
    {
      id: 'edit',
      icon: <Pencil className="size-3.5" />,
      label: ui.counterparties.edit,
      separatorBefore: true,
      onSelect: () => onEdit(row),
    },
    archived
      ? {
          id: 'restore',
          icon: <RotateCcw className="size-3.5" />,
          label: ui.counterparties.restore,
          onSelect: () => onArchive(row, false),
        }
      : {
          id: 'archive',
          icon: <Archive className="size-3.5" />,
          label: ui.counterparties.archive,
          onSelect: () => onArchive(row, true),
        },
    {
      id: 'delete',
      icon: <Trash2 className="size-3.5" />,
      label: ui.counterparties.delete,
      danger: true,
      onSelect: () => onDelete(row),
    },
  ];
}
