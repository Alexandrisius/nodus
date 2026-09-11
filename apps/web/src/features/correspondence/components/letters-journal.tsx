import { ui } from '@nodus/contracts';
import type { LetterListItem } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { useLettersList, useRegisterLetter, type LettersFolder } from '../api/letters-api.js';
import { letterJournalFields } from '../lib/letter-fields.js';

/** Журнал писем: каноническая таблица (shared/views, ключ `letters.journal`) —
 *  колонки и ширины настраиваются шестерёнкой и ручкой, память между сессиями;
 *  локальный поиск и фильтры — пропом от строки инструментов страницы;
 *  в очереди «Незарегистрированные» — инлайн-действие «Зарегистрировать»
 *  (поток А: ≤ 30 секунд на регистрацию, без открытия карточки). */
export function LettersJournal({
  folder,
  filter,
}: {
  folder: LettersFolder;
  filter?: ActiveListFilter<LetterListItem>;
}) {
  const { data, isLoading } = useLettersList(folder);
  const register = useRegisterLetter();
  const openCard = useOpenCard();
  const rows = useFilteredList(data?.items ?? [], filter);

  function openLetter(letter: LetterListItem, rowEl: HTMLElement) {
    openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect());
  }

  return (
    <DataTable
      viewKey="letters.journal"
      defs={letterJournalFields}
      rows={rows}
      rowKey={(letter) => letter.id}
      isLoading={isLoading}
      onOpenRow={openLetter}
      emptyTitle={ui.common.empty}
      actions={
        folder === 'unregistered'
          ? (letter) =>
              letter.status === 'unregistered' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={register.isPending}
                  onClick={() => register.mutate(letter.id)}
                >
                  {ui.letters.register}
                </Button>
              ) : null
          : undefined
      }
    />
  );
}
