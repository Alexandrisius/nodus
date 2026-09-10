import {
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  Hash,
  Milestone,
  User,
} from 'lucide-react';
import { memo } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { LetterStatusBadge } from './letter-status-badge.js';

const VISIBILITY_KEY = 'nodus-letter-fields-v1';

const monoValue = 'font-mono text-[12px] tabular-nums';

/** Инспектор полей письма (общий каркас EntityFields, свои defs): реквизиты
 *  документа — корреспондент, номера и даты, статус, адресат, проект, срок.
 *  Видимость — кнопка «+ Поле» (persist localStorage, свой ключ сущности). */
export const LetterFields = memo(function LetterFields({ letter }: { letter: LetterDetail }) {
  const defs: EntityFieldDef[] = [
    {
      key: 'correspondent',
      icon: <Building2 className="size-3.5" />,
      label: ui.letters.correspondent,
      render: () => <span>{letter.correspondent}</span>,
    },
    {
      key: 'status',
      icon: <Milestone className="size-3.5" />,
      label: ui.letters.fieldStatus,
      render: () => <LetterStatusBadge status={letter.status} />,
    },
    {
      key: 'regNumber',
      icon: <Hash className="size-3.5" />,
      label: ui.letters.regNumber,
      render: () =>
        letter.regNumber ? <span className={monoValue}>{letter.regNumber}</span> : ui.common.notSet,
    },
    {
      key: 'regDate',
      icon: <CalendarCheck2 className="size-3.5" />,
      label: ui.letters.regDate,
      render: () =>
        letter.regDate ? (
          <span className={monoValue}>{formatDate(letter.regDate)}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'receivedAt',
      icon: <CalendarDays className="size-3.5" />,
      label: ui.letters.receivedAt,
      render: () => <span className={monoValue}>{formatDateTime(letter.receivedAt)}</span>,
    },
    {
      key: 'addressee',
      icon: <User className="size-3.5" />,
      label: ui.letters.addressee,
      render: () =>
        letter.addressee ? (
          <>
            <PersonAvatar name={letter.addressee.displayName} className="size-6" />
            <span>{letter.addressee.displayName}</span>
          </>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'project',
      icon: <FolderKanban className="size-3.5" />,
      label: ui.letters.project,
      render: () =>
        letter.project ? (
          <span className="font-mono text-[12px] text-info">{letter.project.name}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'deadline',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.letters.deadline,
      render: () => <DeadlineChip deadline={letter.deadline} />,
    },
  ];

  return <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />;
});
