import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CounterpartyListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useCounterpartiesList } from '../../../shared/counterparties/api.js';
import { DataTable } from '../../../shared/views/data-table.js';
import type { FilterFieldDef, FilterValue } from '../../../shared/views/list-filters.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import { counterpartyFields } from '../lib/counterparty-fields.js';
import { CounterpartyCreateDialog } from '../components/counterparty-create-dialog.js';

/** Контрагенты — вкладка раздела CRM (#83): справочник внешних организаций
 *  (заказчики, подрядчики, поставщики, госорганы). Реестр — каноническая
 *  таблица shared/views (ключ `counterparties.list`), поиск по названию/УНП,
 *  карточка — в стеке. */
export function CounterpartiesPage() {
  const { data, isLoading } = useCounterpartiesList();
  const openCard = useOpenCard();
  const [createOpen, setCreateOpen] = useState(false);
  const toolbar = useListToolbar('counterparties.list');

  const defs = useMemo<FilterFieldDef<CounterpartyListItem>[]>(
    () => [
      {
        id: 'unp',
        label: ui.counterparties.unp,
        type: 'text' as const,
        placeholder: ui.counterparties.unpHint,
        match: (c: CounterpartyListItem, v: FilterValue) =>
          typeof v !== 'string' || (c.unp ?? '').includes(v),
      },
    ],
    [],
  );
  const searchText = useMemo(
    () => (c: CounterpartyListItem) => `${c.shortName} ${c.fullName} ${c.unp ?? ''}`,
    [],
  );
  const filter = useMemo(
    () => ({ defs, state: toolbar.filters, query: toolbar.query, searchText }),
    [defs, toolbar.filters, toolbar.query, searchText],
  );
  const rows = useFilteredList(data?.items ?? [], filter);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">
          {ui.counterparties.title}
          <span className="ml-2 align-middle font-mono text-label-lg font-normal text-muted-foreground tabular-nums">
            {data?.items.length ?? 0}
          </span>
        </h1>
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={defs}
          left={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />
              {ui.counterparties.create}
            </Button>
          }
          right={<ViewSettings viewKey="counterparties.list" defs={counterpartyFields} />}
        />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          viewKey="counterparties.list"
          defs={counterpartyFields}
          rows={rows}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          onOpenRow={(c, rowEl) =>
            openCard({ kind: 'counterparty', id: c.id }, rowEl.getBoundingClientRect())
          }
          emptyTitle={ui.counterparties.empty}
          rowMenu={(c) => makeCardRowMenuItems({ kind: 'counterparty', id: c.id }, openCard)}
        />
      </div>
      <CounterpartyCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
