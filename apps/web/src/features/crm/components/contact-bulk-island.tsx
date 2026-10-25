import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { BulkIsland, bulkActionClass } from '../../../shared/views/bulk-island.js';
import { useBulkContacts } from '../api/counterparty-edit.js';

/**
 * Островок массовых действий вкладки «Контакты» (#460) — тот же общий каркас
 * `shared/views/bulk-island`, что у реестра контрагентов и журнала задач
 * (одна механика во всех списочных представлениях). Действия зависят от
 * выделения: «В архив» — если среди выбранных есть действующие, «Из архива» —
 * если есть архивные, «Удалить» — всегда (необратимо, но канон островка —
 * без диалога: как в реестре контрагентов).
 */
export function ContactBulkIsland({
  counterpartyId,
  selectedIds,
  hasActive,
  hasArchived,
  visible,
  onClear,
}: {
  counterpartyId: string;
  selectedIds: readonly string[];
  hasActive: boolean;
  hasArchived: boolean;
  visible: boolean;
  onClear: () => void;
}) {
  const bulk = useBulkContacts(counterpartyId);

  const run = (action: 'archive' | 'restore' | 'delete') =>
    bulk.mutate({ ids: selectedIds, action }, { onSuccess: () => onClear() });

  return (
    <BulkIsland
      visible={visible}
      count={selectedIds.length}
      ariaLabel={ui.counterparties.contactPersons}
      pending={bulk.isPending}
      onClear={onClear}
    >
      {hasActive ? (
        <button
          type="button"
          className={bulkActionClass}
          tabIndex={visible ? 0 : -1}
          disabled={bulk.isPending}
          onClick={() => run('archive')}
        >
          <Archive className="size-4" strokeWidth={1.75} />
          {ui.counterparties.bulkArchive}
        </button>
      ) : null}
      {hasArchived ? (
        <button
          type="button"
          className={bulkActionClass}
          tabIndex={visible ? 0 : -1}
          disabled={bulk.isPending}
          onClick={() => run('restore')}
        >
          <RotateCcw className="size-4" strokeWidth={1.75} />
          {ui.counterparties.bulkRestore}
        </button>
      ) : null}
      <button
        type="button"
        className={bulkActionClass}
        tabIndex={visible ? 0 : -1}
        disabled={bulk.isPending}
        onClick={() => run('delete')}
      >
        <Trash2 className="size-4" strokeWidth={1.75} />
        {ui.counterparties.bulkDelete}
      </button>
    </BulkIsland>
  );
}
