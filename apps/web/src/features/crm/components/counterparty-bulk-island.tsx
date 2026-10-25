import { Archive, RotateCcw } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { BulkIsland, bulkActionClass } from '../../../shared/views/bulk-island.js';
import { useBulkCounterparties } from '../api/counterparty-edit.js';

const BULK_LIMIT = 100;

/**
 * Островок массовых действий реестра контрагентов (#460): каркас — общий
 * `shared/views/bulk-island` (одна механика во всех модулях, вердикт
 * владельца 25.10.2026), здесь — только действия CRM: «В архив» и
 * «Из архива». Сервер проверяет каждую запись отдельно и отвечает по
 * записи; тост — «изменено n из m».
 */
export function CounterpartyBulkIsland({
  selectedIds,
  visible,
  onClear,
}: {
  selectedIds: readonly string[];
  /** Есть выделение (счётчик уходит вместе с островком). */
  visible: boolean;
  onClear: () => void;
}) {
  const bulk = useBulkCounterparties();

  function run(kind: 'archive' | 'restore') {
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
    </BulkIsland>
  );
}
