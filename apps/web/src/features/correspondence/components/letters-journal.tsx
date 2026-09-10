import { useNavigate } from '@tanstack/react-router';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useShellStore } from '../../../app/shell/shell-store.js';
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
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);

  function openLetter(letter: LetterListItem, rowEl: HTMLElement) {
    const rect = rowEl.getBoundingClientRect();
    setLastSource({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    void navigate({
      to: '/letters/$letterId',
      params: { letterId: letter.id },
      search: { folder },
    });
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
