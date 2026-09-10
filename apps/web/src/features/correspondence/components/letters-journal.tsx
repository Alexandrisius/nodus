import { ui } from '@nodus/contracts';
import type { LetterListItem } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { useLettersList, useRegisterLetter, type LettersFolder } from '../api/letters-api.js';
import { letterJournalFields } from '../lib/letter-fields.js';

/** Журнал писем: каноническая таблица (shared/views, ключ `letters.journal`) —
 *  колонки и ширины настраиваются шестерёнкой и ручкой, память между сессиями;
 *  в очереди «Незарегистрированные» — инлайн-действие «Зарегистрировать»
 *  (поток А: ≤ 30 секунд на регистрацию, без открытия карточки). */
export function LettersJournal({ folder }: { folder: LettersFolder }) {
  const { data, isLoading } = useLettersList(folder);
  const register = useRegisterLetter();
  const openCard = useOpenCard();

  function openLetter(letter: LetterListItem, rowEl: HTMLElement) {
    openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect());
  }

  return (
    <DataTable
      viewKey="letters.journal"
      defs={letterJournalFields}
      rows={data?.items ?? []}
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
