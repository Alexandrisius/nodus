import { CalendarCheck2, CalendarClock, FolderKanban, Hash, Milestone } from 'lucide-react';
import { memo } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate } from '../../../shared/lib/format.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { LetterStatusBadge } from './letter-status-badge.js';

const VISIBILITY_KEY = 'nodus-letter-fields-v1';

const monoValue = 'font-mono text-[12px] tabular-nums';

/** Реквизиты регистрации письма (общий каркас EntityFields, свои defs):
 *  статус, рег. номер и дата, проект, срок. Корреспондент/адресат/время —
 *  в почтовой шапке карточки (модель почтового клиента), здесь не дублируются
 *  (вердикт владельца 2026-09-10, раунд 2). Видимость — кнопка «+ Поле»
 *  (persist localStorage, свой ключ сущности). */
export const LetterRequisites = memo(function LetterRequisites({
  letter,
}: {
  letter: LetterDetail;
}) {
  const defs: EntityFieldDef[] = [
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
