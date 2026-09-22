import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import type { LetterListItem, LetterType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDate, formatDateTimeShort } from '../../../shared/lib/format.js';
import { monoCell, PersonCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';
import { ChannelChip } from '../components/channel-chip.js';
import { DocumentStatusBadge } from '../components/document-status-badge.js';
import { documentStateOf, todayStr } from './letter-document.js';

/** Направление письма: входящее — к нам (стрелка вниз-влево), исходящее — от нас. */
export function LetterTypeIcon({ letter }: { letter: { type: LetterType } }) {
  return letter.type === 'incoming' ? (
    <ArrowDownLeft
      className="size-3.5 shrink-0 text-info/70"
      aria-label={ui.letters.typeIncoming}
    />
  ) : (
    <ArrowUpRight className="size-3.5 shrink-0 text-info/70" aria-label={ui.letters.typeOutgoing} />
  );
}

/** Чип срока исполнения документа (дата без времени): просрочен — красный,
 *  сегодня — оранжевый (тон как у DeadlineChip задач, но формат даты). */
export function LetterDeadlineChip({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return <span className="text-xs text-muted-foreground">{ui.common.noDeadline}</span>;
  }
  const overdue = deadline < todayStr();
  const today = deadline === todayStr();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
        overdue ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
        !overdue && today && 'bg-warning-soft text-warning',
      )}
    >
      <CalendarClock className="size-3.5" />
      {formatDate(deadline)}
    </span>
  );
}

/** Ячейка рег.№: чип направления + номер моно (данные — моно, канон
 *  типографики) или прочерк у письма без регистрации. */
function RegNumberCell({ letter }: { letter: LetterListItem }) {
  return (
    <>
      <LetterTypeIcon letter={letter} />
      {letter.registration ? (
        <span className="font-mono text-label-sm tabular-nums">
          {letter.registration.regNumber}
        </span>
      ) : (
        <span className={monoCell}>—</span>
      )}
    </>
  );
}

/**
 * Реестр колонок почтового списка (Входящие/Отправленные), ключ вида
 * `letters.mail`: новое поле модуля = +1 запись здесь. minWidth — под
 * осмысленный контент (самый длинный чип статуса ~150px).
 */
export const letterMailFields: DataTableField<LetterListItem>[] = [
  {
    id: 'regNumber',
    label: ui.letters.regNumber,
    defaultVisible: true,
    defaultWidth: 152,
    minWidth: 112,
    render: (letter) => <RegNumberCell letter={letter} />,
    sortValue: (letter) => letter.registration?.regNumber ?? null,
  },
  {
    id: 'channel',
    label: ui.letters.channel,
    defaultVisible: true,
    defaultWidth: 128,
    minWidth: 104,
    render: (letter) => <ChannelChip channel={letter.receiveChannel} />,
    sortValue: (letter) => letter.receiveChannel,
  },
  {
    id: 'counterparty',
    label: ui.letters.counterparty,
    defaultVisible: true,
    defaultWidth: 240,
    minWidth: 140,
    render: (letter) => <span className="truncate text-sm">{letter.counterparty.name}</span>,
    sortValue: (letter) => letter.counterparty.name,
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
    sortValue: (letter) => letter.subject,
  },
  {
    id: 'documentStatus',
    label: ui.letters.fieldStatus,
    defaultVisible: true,
    defaultWidth: 160,
    minWidth: 128,
    render: (letter) => <DocumentStatusBadge letter={letter} />,
    sortValue: (letter) => documentStateOf(letter),
  },
  {
    id: 'addressee',
    label: ui.letters.responsible,
    defaultVisible: true,
    defaultWidth: 200,
    minWidth: 110,
    render: (letter) => <PersonCell user={letter.registration?.addressee} />,
    sortValue: (letter) => letter.registration?.addressee?.displayName ?? null,
  },
  {
    id: 'date',
    label: ui.letters.date,
    defaultVisible: true,
    defaultWidth: 152,
    minWidth: 128,
    render: (letter) => <span className={monoCell}>{formatDateTimeShort(letter.date)}</span>,
    sortValue: (letter) => letter.date,
  },
  {
    id: 'project',
    label: ui.letters.project,
    defaultVisible: false,
    defaultWidth: 180,
    minWidth: 120,
    render: (letter) =>
      letter.registration?.project ? (
        <span className="truncate text-body-xs text-info/80">
          {letter.registration.project.name}
        </span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (letter) => letter.registration?.project?.name ?? null,
  },
  {
    id: 'deadline',
    label: ui.letters.deadline,
    defaultVisible: false,
    defaultWidth: 172,
    minWidth: 140,
    render: (letter) => <LetterDeadlineChip deadline={letter.registration?.deadline ?? null} />,
    sortValue: (letter) => letter.registration?.deadline ?? null,
  },
  {
    id: 'regDate',
    label: ui.letters.regDate,
    defaultVisible: false,
    defaultWidth: 132,
    minWidth: 108,
    render: (letter) =>
      letter.registration ? (
        <span className={monoCell}>{formatDate(letter.registration.regDate)}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (letter) => letter.registration?.regDate ?? null,
  },
];
