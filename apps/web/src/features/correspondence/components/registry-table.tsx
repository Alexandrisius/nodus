import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import { useLettersList } from '../api/letters-api.js';
import { letterRegistryFields } from '../lib/registry-fields.js';

/** Журнал корреспонденции — вид-реестр ТОЛЬКО документов (Вх/Исх), как
 *  бумажные журналы канцелярии: почта (письма без регистрации) в журнал не
 *  попадает; фильтры «в работе / просрочено / в деле» — пресеты страницы;
 *  виден всем сотрудникам компании (вердикт владельца 22.09.2026). */
export function RegistryTable({ filter }: { filter?: ActiveListFilter<LetterListItem> }) {
  const { data, isLoading } = useLettersList('registry');
  const openCard = useOpenCard();
  const rows = useFilteredList(data?.items ?? [], filter);

  return (
    <DataTable
      viewKey="letters.registry"
      defs={letterRegistryFields}
      rows={rows}
      rowKey={(letter) => letter.id}
      isLoading={isLoading}
      onOpenRow={(letter, rowEl) =>
        openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect())
      }
      emptyTitle={ui.common.empty}
      rowMenu={(letter) => makeCardRowMenuItems({ kind: 'letter', id: letter.id }, openCard)}
    />
  );
}
