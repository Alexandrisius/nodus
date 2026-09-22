import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate } from '../../../shared/lib/format.js';
import { monoCell, PersonCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';
import { ChannelChip } from '../components/channel-chip.js';
import { DocumentStatusBadge } from '../components/document-status-badge.js';
import { documentStateOf } from './letter-document.js';
import { LetterDeadlineChip, LetterTypeIcon } from './letter-fields.js';

/**
 * Реестр колонок Журнала корреспонденции (ключ вида `letters.registry`):
 * вид-реестр ТОЛЬКО документов (Вх/Исх) — как бумажные журналы канцелярии,
 * почта в журнал не попадает (вердикт владельца 22.09.2026).
 */
export const letterRegistryFields: DataTableField<LetterListItem>[] = [
  {
    id: 'regNumber',
    label: ui.letters.regNumber,
    defaultVisible: true,
    defaultWidth: 160,
    minWidth: 128,
    render: (letter) => (
      <>
        <LetterTypeIcon letter={letter} />
        <span className="font-mono text-label-sm tabular-nums">
          {letter.registration?.regNumber}
        </span>
      </>
    ),
    sortValue: (letter) => letter.registration?.regNumber ?? null,
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
    id: 'counterparty',
    label: ui.letters.counterparty,
    defaultVisible: true,
    defaultWidth: 230,
    minWidth: 140,
    render: (letter) => <span className="truncate text-sm">{letter.counterparty.name}</span>,
    sortValue: (letter) => letter.counterparty.name,
  },
  {
    id: 'subject',
    label: ui.letters.subject,
    defaultVisible: true,
    defaultWidth: 320,
    minWidth: 160,
    maxWidth: 640,
    locked: true,
    render: (letter) => <span className="truncate text-sm font-medium">{letter.subject}</span>,
    sortValue: (letter) => letter.subject,
  },
  {
    id: 'addressee',
    label: ui.letters.addressee,
    defaultVisible: true,
    defaultWidth: 180,
    minWidth: 110,
    render: (letter) => <PersonCell user={letter.registration?.addressee} />,
    sortValue: (letter) => letter.registration?.addressee?.displayName ?? null,
  },
  {
    id: 'project',
    label: ui.letters.project,
    defaultVisible: true,
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
    defaultVisible: true,
    defaultWidth: 150,
    minWidth: 128,
    render: (letter) => <LetterDeadlineChip deadline={letter.registration?.deadline ?? null} />,
    sortValue: (letter) => letter.registration?.deadline ?? null,
  },
  {
    id: 'regDate',
    label: ui.letters.regDate,
    defaultVisible: true,
    defaultWidth: 132,
    minWidth: 108,
    render: (letter) =>
      letter.registration ? (
        <span className={monoCell}>{formatDate(letter.registration.regDate)}</span>
      ) : null,
    sortValue: (letter) => letter.registration?.regDate ?? null,
  },
  {
    id: 'correspondentNumber',
    label: ui.letters.correspondentNumber,
    defaultVisible: false,
    defaultWidth: 170,
    minWidth: 120,
    render: (letter) =>
      letter.registration?.correspondentNumber ? (
        <span className={monoCell}>{letter.registration.correspondentNumber}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (letter) => letter.registration?.correspondentNumber ?? null,
  },
  {
    id: 'correspondentDate',
    label: ui.letters.correspondentDate,
    defaultVisible: false,
    defaultWidth: 140,
    minWidth: 108,
    render: (letter) =>
      letter.registration?.correspondentDate ? (
        <span className={monoCell}>{formatDate(letter.registration.correspondentDate)}</span>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (letter) => letter.registration?.correspondentDate ?? null,
  },
  {
    id: 'channel',
    label: ui.letters.channel,
    defaultVisible: false,
    defaultWidth: 128,
    minWidth: 104,
    render: (letter) => <ChannelChip channel={letter.receiveChannel} />,
    sortValue: (letter) => letter.receiveChannel,
  },
];
