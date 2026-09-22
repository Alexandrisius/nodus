import {
  ArrowLeftRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  FileText,
  FolderKanban,
  Hash,
  Mailbox,
  Milestone,
  Radio,
  UserRound,
} from 'lucide-react';
import { memo } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDate } from '../../../shared/lib/format.js';
import { EntityFields, type EntityFieldDef } from '../../../shared/ui/entity-fields.js';
import { PersonCell } from '../../../shared/ui/person-cell.js';
import { ChannelChip } from './channel-chip.js';
import { DocumentStatusBadge } from './document-status-badge.js';
import { LetterDeadlineChip } from '../lib/letter-fields.js';

// Поля v2 — новый состав, старый профиль видимости не переносится.
const VISIBILITY_KEY = 'nodus-letter-fields-v2';

const monoValue = 'font-mono text-label-sm tabular-nums';

/** Реквизиты письма-документа (общий каркас EntityFields, свои defs):
 *  статус, рег.№/дата, тип, вид документа, проект, адресат, срок, реквизиты
 *  документа корреспондента, канал, ящик. Корреспондент/кому/дата — в почтовой
 *  шапке карточки, здесь не дублируются (вердикт 2026-09-10, раунд 2). */
export const LetterRequisites = memo(function LetterRequisites({
  letter,
}: {
  letter: LetterDetail;
}) {
  const reg = letter.registration;
  const defs: EntityFieldDef[] = [
    {
      key: 'status',
      icon: <Milestone className="size-3.5" />,
      label: ui.letters.fieldStatus,
      render: () =>
        letter.registration ? (
          <DocumentStatusBadge letter={letter} />
        ) : (
          <span className="text-sm text-muted-foreground">{ui.letters.noRegistration}</span>
        ),
    },
    {
      key: 'regNumber',
      icon: <Hash className="size-3.5" />,
      label: ui.letters.regNumber,
      render: () => (reg ? <span className={monoValue}>{reg.regNumber}</span> : ui.common.notSet),
    },
    {
      key: 'regDate',
      icon: <CalendarCheck2 className="size-3.5" />,
      label: ui.letters.regDate,
      render: () =>
        reg ? <span className={monoValue}>{formatDate(reg.regDate)}</span> : ui.common.notSet,
    },
    {
      key: 'type',
      icon: <ArrowLeftRight className="size-3.5" />,
      label: ui.letters.registerType,
      render: () =>
        letter.type === 'incoming' ? ui.letters.typeIncoming : ui.letters.typeOutgoing,
    },
    {
      key: 'documentKind',
      icon: <FileText className="size-3.5" />,
      label: ui.letters.documentKind,
      render: () => reg?.documentKind.name ?? ui.common.notSet,
    },
    {
      key: 'project',
      icon: <FolderKanban className="size-3.5" />,
      label: ui.letters.project,
      render: () =>
        reg?.project ? (
          <span className="text-sm text-info">{reg.project.name}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'addressee',
      icon: <UserRound className="size-3.5" />,
      label: ui.letters.addressee,
      render: () => <PersonCell user={reg?.addressee} />,
    },
    {
      key: 'deadline',
      icon: <CalendarClock className="size-3.5" />,
      label: ui.letters.deadline,
      render: () => <LetterDeadlineChip deadline={reg?.deadline ?? null} />,
    },
    {
      key: 'correspondentNumber',
      icon: <FileText className="size-3.5" />,
      label: ui.letters.correspondentNumber,
      render: () =>
        reg?.correspondentNumber ? (
          <span className={monoValue}>{reg.correspondentNumber}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'correspondentDate',
      icon: <CalendarDays className="size-3.5" />,
      label: ui.letters.correspondentDate,
      render: () =>
        reg?.correspondentDate ? (
          <span className={monoValue}>{formatDate(reg.correspondentDate)}</span>
        ) : (
          ui.common.notSet
        ),
    },
    {
      key: 'channel',
      icon: <Radio className="size-3.5" />,
      label: ui.letters.channel,
      render: () => <ChannelChip channel={letter.receiveChannel} />,
    },
    {
      key: 'mailbox',
      icon: <Mailbox className="size-3.5" />,
      label: ui.letters.mailbox,
      render: () => <span className={monoValue}>{letter.mailbox.address}</span>,
    },
  ];

  return <EntityFields defs={defs} storageKey={VISIBILITY_KEY} />;
});
