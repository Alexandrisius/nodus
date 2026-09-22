import { Check } from 'lucide-react';
import { useState } from 'react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList } from '../../../shared/views/use-list-toolbar.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';
import { useLettersList } from '../api/letters-api.js';
import { isRegistrable } from '../lib/letter-document.js';
import { letterMailFields } from '../lib/letter-fields.js';
import { RegistrationDialog } from './registration-dialog.js';

/** Почтовый список (Входящие / Отправленные): каноническая таблица
 *  shared/views, ключ вида `letters.mail`. Незарегистрированные входящие —
 *  ЧАСТЬ Входящих (отдельной папки нет, модель v2): экспресс-действие
 *  «Зарегистрировать» в ячейке и меню строки открывает карточку регистрации
 *  (поток А: ≤ 30 секунд на регистрацию). */
export function LettersTable({
  folder,
  filter,
}: {
  folder: 'incoming' | 'outgoing';
  filter?: ActiveListFilter<LetterListItem>;
}) {
  const { data, isLoading } = useLettersList(folder);
  const openCard = useOpenCard();
  const rows = useFilteredList(data?.items ?? [], filter);
  const [registerFor, setRegisterFor] = useState<LetterListItem | null>(null);

  function openLetter(letter: LetterListItem, rowEl: HTMLElement) {
    openCard({ kind: 'letter', id: letter.id }, rowEl.getBoundingClientRect());
  }

  return (
    <>
      <DataTable
        viewKey="letters.mail"
        defs={letterMailFields}
        rows={rows}
        rowKey={(letter) => letter.id}
        isLoading={isLoading}
        onOpenRow={openLetter}
        emptyTitle={ui.common.empty}
        rowMenu={(letter) => {
          const items = makeCardRowMenuItems({ kind: 'letter', id: letter.id }, openCard);
          if (isRegistrable(letter)) {
            items.splice(1, 0, {
              id: 'register',
              icon: <Check className="size-3.5" />,
              label: ui.letters.register,
              onSelect: () => setRegisterFor(letter),
            });
          }
          return items;
        }}
        actions={
          folder === 'incoming'
            ? (letter) =>
                isRegistrable(letter) ? (
                  <Button size="sm" variant="outline" onClick={() => setRegisterFor(letter)}>
                    {ui.letters.register}
                  </Button>
                ) : null
            : undefined
        }
      />
      <RegistrationDialog
        letter={registerFor}
        onOpenChange={(open) => {
          if (!open) setRegisterFor(null);
        }}
      />
    </>
  );
}
