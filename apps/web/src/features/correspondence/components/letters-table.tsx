import { Inbox, Send } from 'lucide-react';
import { useMemo } from 'react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { letterRows, useLettersInfinite } from '../../../shared/api/letters-list.js';
import { useDebouncedValue } from '../../../shared/lib/use-debounced-value.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import { DataTable } from '../../../shared/views/data-table.js';
import {
  letterBuiltinPresets,
  useLetterFilterDefs,
} from '../../../shared/views/letter-filter-fields.js';
import { makeLetterTableFields } from '../../../shared/views/letter-table-fields.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { usePrefetchLetter } from '../api/letters-queries.js';
import { LettersEmpty, LettersLoadError } from './letters-empty.js';
import { LettersHeader } from './letters-header.js';

type JournalBox = 'incoming' | 'outgoing';

const journal = {
  incoming: {
    label: ui.letters.tabs.incoming,
    icon: Inbox,
    empty: ui.letters.list.incomingEmpty,
    hint: ui.letters.list.incomingEmptyHint,
  },
  outgoing: {
    label: ui.letters.tabs.outgoing,
    icon: Send,
    empty: ui.letters.list.outgoingEmpty,
    hint: ui.letters.list.outgoingEmptyHint,
  },
} as const;

const letterKey = (letter: LetterListItem) => letter.id;

/**
 * Журнал «Входящие» / «Исходящие» (#55, U6) — зарегистрированные письма
 * направления: каноническая таблица shared/views (свой viewKey на вкладку —
 * своя память колонок и фильтров), курсорная подгрузка sentinel-ом,
 * СЕРВЕРНЫЙ поиск (№, тема, их №, корреспондент; задержка 250 мс, прежние
 * строки — до ответа), поля фильтра и пресеты «Мне адресованы» / «Срок
 * ответа истёк» — локально по загруженным страницам. Создания здесь нет:
 * входящее рождается в «Новых», исходящее — с отправкой из портала.
 * Строка — карточка письма поверх стека (префетч по ховеру).
 */
export function LettersTable({ box }: { box: JournalBox }) {
  const copy = journal[box];
  const viewKey = `letters.${box}`;
  const toolbar = useListToolbar(viewKey, letterBuiltinPresets);
  const search = useDebouncedValue(toolbar.query.trim(), 250);
  const query = useLettersInfinite(box, { search: search || undefined });
  const serverRows = useMemo(() => letterRows(query.data), [query.data]);
  const fields = useMemo(() => makeLetterTableFields(), []);
  const defs = useLetterFilterDefs(serverRows);
  // Запрос уже применил сервер — локально только поля фильтра (иначе
  // совпадения по «их №» отсеялись бы клиентской подстрокой).
  const filter = useMemo<ActiveListFilter<LetterListItem>>(
    () => ({ defs, state: toolbar.filters, query: '' }),
    [defs, toolbar.filters],
  );
  const rows = useFilteredList(serverRows, filter);
  const openCard = useOpenCard();
  const prefetch = usePrefetchLetter();

  const failed = query.isError && !query.data;
  const pristine = query.isSuccess && serverRows.length === 0 && !search;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LettersHeader
        count={query.isSuccess ? `${rows.length}${query.hasNextPage ? '+' : ''}` : undefined}
      >
        <ListToolbar
          className="min-w-0 flex-1 px-0"
          toolbar={toolbar}
          defs={defs}
          builtinPresets={letterBuiltinPresets}
          searchPlaceholder={ui.letters.list.searchPlaceholder}
          right={<ViewSettings viewKey={viewKey} defs={fields} />}
        />
      </LettersHeader>
      <div className="min-h-0 flex-1">
        {failed ? (
          <LettersLoadError onRetry={() => void query.refetch()} />
        ) : pristine ? (
          <LettersEmpty icon={copy.icon} title={copy.empty} hint={copy.hint} />
        ) : (
          <DataTable
            viewKey={viewKey}
            defs={fields}
            rows={rows}
            rowKey={letterKey}
            isLoading={query.isLoading}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
            label={copy.label}
            emptyTitle={ui.filters.notFound}
            onHoverRow={(letter) => prefetch(letter.id)}
            onOpenRow={(letter, rowEl) =>
              openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect())
            }
            rowMenu={(letter) => makeCardRowMenuItems({ kind: 'letter', id: letter.id }, openCard)}
          />
        )}
      </div>
    </div>
  );
}
