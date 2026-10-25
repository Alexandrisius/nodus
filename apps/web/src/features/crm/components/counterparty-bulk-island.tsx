import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { BulkIsland, bulkActionClass } from '../../../shared/views/bulk-island.js';
import { useBulkCounterparties } from '../api/counterparty-edit.js';

const BULK_LIMIT = 100;

/**
 * Островок массовых действий реестра контрагентов (#460): каркас — общий
 * `shared/views/bulk-island` (одна механика во всех модулях), здесь — только
 * действия CRM. Действия ЗАВИСЯТ ОТ ВЫДЕЛЕНИЯ (вердикт владельца 25.10.2026):
 * «В архив» — только если среди выбранных есть действующие, «Из архива» —
 * только если есть архивные, «Удалить» — всегда (связанные записи сервер
 * пропускает с причиной `CRM_COUNTERPARTY_IN_USE`). Тост — «изменено n из m».
 */
export function CounterpartyBulkIsland({
  selectedIds,
  hasActive,
  hasArchived,
  visible,
  onClear,
}: {
  selectedIds: readonly string[];
  /** Среди выбранных есть действующие записи. */
  hasActive: boolean;
  /** Среди выбранных есть архивные записи. */
  hasArchived: boolean;
  /** Есть выделение (счётчик уходит вместе с островком). */
  visible: boolean;
  onClear: () => void;
}) {
  const bulk = useBulkCounterparties();

  function run(kind: 'archive' | 'restore' | 'delete') {
    if (selectedIds.length > BULK_LIMIT) {
      toast.error(`${ui.counterparties.bulkLimit} ${BULK_LIMIT}`);
      return;
    }
    bulk.mutate(
      { counterpartyIds: [...selectedIds], action: { kind } },
      { onSuccess: () => onClear() },
    );
  }

  return (
    <BulkIsland
      visible={visible}
      count={selectedIds.length}
      ariaLabel={ui.counterparties.title}
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
