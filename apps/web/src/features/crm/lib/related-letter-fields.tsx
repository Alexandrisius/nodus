import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { formatDate } from '../../../shared/lib/format.js';
import { monoCell } from '../../../shared/ui/person-cell.js';
import type { DataTableField } from '../../../shared/views/data-table.js';

/** Реестр колонок вкладки «Письма» карточки контрагента (ключ вида
 *  `crm.letters`): переписка с организацией — направление и рег.№, тема,
 *  дата, статус документа. Полный реестр писем живёт в фиче корреспонденции
 *  (I6: фичи друг друга не импортируют) — здесь срез «для контрагента». */
export const relatedLetterFields: DataTableField<LetterListItem>[] = [
  {
    id: 'regNumber',
    label: ui.letters.regNumber,
    defaultVisible: true,
    defaultWidth: 150,
    minWidth: 112,
    render: (letter) => (
      <>
        {letter.type === 'incoming' ? (
          <ArrowDownLeft
            className="size-3.5 shrink-0 text-info/70"
            aria-label={ui.letters.typeIncoming}
          />
        ) : (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-info/70"
            aria-label={ui.letters.typeOutgoing}
          />
        )}
        <span className={monoCell}>{letter.registration?.regNumber ?? '—'}</span>
      </>
    ),
    sortValue: (letter) => letter.registration?.regNumber ?? null,
  },
  {
    id: 'subject',
    label: ui.letters.subject,
    defaultVisible: true,
    defaultWidth: 380,
    minWidth: 180,
    maxWidth: 640,
    locked: true,
    render: (letter) => <span className="truncate text-sm font-medium">{letter.subject}</span>,
    sortValue: (letter) => letter.subject,
  },
  {
    id: 'date',
    label: ui.letters.date,
    defaultVisible: true,
    defaultWidth: 116,
    minWidth: 96,
    render: (letter) => <span className={monoCell}>{formatDate(letter.date)}</span>,
    sortValue: (letter) => letter.date,
  },
  {
    id: 'status',
    label: ui.letters.fieldStatus,
    defaultVisible: true,
    defaultWidth: 132,
    minWidth: 104,
    render: (letter) =>
      letter.documentStatus ? (
        <NodeChip tone="muted" className="shrink-0">
          {ui.letters.documentStatus[letter.documentStatus]}
        </NodeChip>
      ) : (
        <span className={monoCell}>—</span>
      ),
    sortValue: (letter) => letter.documentStatus,
  },
];
