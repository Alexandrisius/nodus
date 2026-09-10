import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate, formatDateTimeShort } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import type { DataTableField } from '../../../shared/views/data-table.js';
import { LetterStatusBadge } from '../components/letter-status-badge.js';

const monoCell = 'font-mono text-[11px] text-muted-foreground tabular-nums';

/** Направление письма: входящее — к нам (стрелка вниз-влево), исходящее — от нас. */
export function LetterTypeIcon({ letter }: { letter: LetterListItem }) {
  return letter.type === 'incoming' ? (
    <ArrowDownLeft
      className="size-3.5 shrink-0 text-info/70"
      aria-label={ui.letters.typeIncoming}
    />
  ) : (
    <ArrowUpRight className="size-3.5 shrink-0 text-info/70" aria-label={ui.letters.typeOutgoing} />
  );
}

function personCell(letter: LetterListItem) {
  if (!letter.addressee)
    return <span className="text-xs text-muted-foreground">{ui.common.notSet}</span>;
  return (
    <>
      <PersonAvatar name={letter.addressee.displayName} className="size-6 shrink-0" />
      <span className="truncate">{letter.addressee.displayName}</span>
    </>
  );
}

/**
 * Реестр колонок журнала писем (кастомизация представлений shared/views,
 * ключ вида `letters.journal`): новое поле модуля = +1 запись здесь.
 * minWidth — под осмысленный контент (самый длинный чип статуса ~150px).
 */
export const letterJournalFields: DataTableField<LetterListItem>[] = [
  {
    id: 'regNumber',
    label: ui.letters.regNumber,
    defaultVisible: true,
    defaultWidth: 152,
    minWidth: 112,
    render: (letter) => (
      <>
        <LetterTypeIcon letter={letter} />
        {letter.regNumber ? (
          <span className="font-mono text-[11px] tabular-nums">{letter.regNumber}</span>
        ) : (
          <span className={monoCell}>—</span>
        )}
      </>
    ),
  },
  {
    id: 'correspondent',
    label: ui.letters.correspondent,
    defaultVisible: true,
    defaultWidth: 260,
    minWidth: 140,
    render: (letter) => <span className="truncate text-sm">{letter.correspondent}</span>,
  },
  {
    id: 'subject',
    label: ui.letters.subject,
    defaultVisible: true,
    defaultWidth: 340,
    minWidth: 160,
    maxWidth: 640,
    locked: true,
    render: (letter) => <span className="truncate text-sm font-medium">{letter.subject}</span>,
  },
  {
    id: 'status',
    label: ui.letters.fieldStatus,
    defaultVisible: true,
    defaultWidth: 176,
    minWidth: 152,
    render: (letter) => <LetterStatusBadge status={letter.status} />,
  },
  {
    id: 'addressee',
    label: ui.letters.responsible,
    defaultVisible: true,
    defaultWidth: 200,
    minWidth: 110,
    render: personCell,
  },
  {
    id: 'receivedAt',
    label: ui.letters.receivedAt,
    defaultVisible: true,
    defaultWidth: 152,
    minWidth: 128,
    render: (letter) => <span className={monoCell}>{formatDateTimeShort(letter.receivedAt)}</span>,
  },
  {
    id: 'project',
    label: ui.letters.project,
    defaultVisible: false,
    defaultWidth: 180,
    minWidth: 120,
    render: (letter) =>
      letter.project ? (
        <span className="truncate font-mono text-[11px] text-info/80">{letter.project.name}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
  },
  {
    id: 'deadline',
    label: ui.letters.deadline,
    defaultVisible: false,
    defaultWidth: 172,
    minWidth: 140,
    render: (letter) => <DeadlineChip deadline={letter.deadline} />,
  },
  {
    id: 'regDate',
    label: ui.letters.regDate,
    defaultVisible: false,
    defaultWidth: 132,
    minWidth: 108,
    render: (letter) =>
      letter.regDate ? (
        <span className={monoCell}>{formatDate(letter.regDate)}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
  },
];
